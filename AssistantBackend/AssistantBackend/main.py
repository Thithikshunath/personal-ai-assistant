import os
import json
import re
import datetime
import sqlite3
import asyncio
from pathlib import Path

import openai
import chromadb
import requests
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from ddgs import DDGS
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# --- 1. INITIALIZE APP AND SERVICES ---
load_dotenv()
app = FastAPI()
origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- LLM and Vector DB Clients ---
client_db = chromadb.PersistentClient(path="assistant_memory")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
collection = client_db.get_or_create_collection(name="memory", metadata={"hnsw:space": "cosine"})
client_llm = openai.OpenAI(base_url="http://localhost:15211/v1", api_key="not-needed")

# --- Database and Personalization File Setup ---
DB_FILE = "chats.db"
PERSONA_FILE = "persona.txt"
PROFILE_FILE = "profile.json"

# Default system prompt if persona.txt is empty
DEFAULT_SYSTEM_PROMPT = """You are a powerful and intelligent assistant. Your primary goal is to provide accurate and helpful answers.
<CONTEXT>
- You will be provided with the current date and time. Use it to understand the context of the user's request.
- You will be provided with a user profile. Use it to personalize your responses.
- You will be provided with relevant past memories. Use them to maintain conversation continuity.
</CONTEXT>
<TOOLS>
You have access to a web search tool. To use it, you MUST respond with ONLY a JSON object that strictly follows this format:
{"tool_name": "web_search", "query": "a concise and specific search query"}
</TOOLS>
<FORMATTING_INSTRUCTIONS>
- Always use GitHub Flavored Markdown for lists, bolding, code blocks, and tables.
- When you are asked to provide a table, you MUST format it using Markdown's pipe and hyphen syntax.
</FORMATTING_INSTRUCTIONS>
"""

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    conn.close()
    if not Path(PERSONA_FILE).exists():
        Path(PERSONA_FILE).write_text(DEFAULT_SYSTEM_PROMPT)
    if not Path(PROFILE_FILE).exists():
        Path(PROFILE_FILE).write_text(json.dumps({
            "name": "User",
            "key_facts": ["I am the user of this AI assistant."],
            "main_goals": ["To use this assistant to learn and be more productive."]
        }))

init_db()

# --- Pydantic Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class SettingsModel(BaseModel):
    provider: str = 'brave'
    webSearchEnabled: bool = True

class ChatRequest(BaseModel):
    history: List[ChatMessage]
    continuation: Optional[Dict[str, Any]] = None
    settings: Optional[SettingsModel] = None

class SaveChatRequest(BaseModel):
    title: str
    messages: List[ChatMessage]

class PersonaRequest(BaseModel):
    persona: str

class ProfileRequest(BaseModel):
    name: str = Field(..., description="The user's name.")
    key_facts: List[str] = Field(default_factory=list)
    main_goals: List[str] = Field(default_factory=list)

# --- Helper Functions ---
async def get_relevant_memories(prompt, top_k=3):
    if collection.count() == 0: return ""
    prompt_embedding = await asyncio.to_thread(embedding_model.encode, [prompt])
    results = await asyncio.to_thread(collection.query, query_embeddings=[prompt_embedding[0].tolist()], n_results=top_k)
    if not results or not results['documents'] or not results['documents'][0]: return ""
    memories = "\n".join(results['documents'][0])
    return f"--- PAST MEMORIES ---\n{memories}\n--- END MEMORIES ---"

async def web_search(query: str, provider: str = "brave"):
    if provider == "brave":
        print(f"\n[Performing Brave Search for: {query}]")
        brave_api_key = os.getenv("BRAVE_API_KEY")
        if not brave_api_key:
            return "Brave API key is not configured."
        headers = {"Accept": "application/json", "X-Subscription-Token": brave_api_key}
        params = { "q": query }
        try:
            def sync_search():
                response = requests.get("https://api.search.brave.com/res/v1/web/search", params=params, headers=headers, timeout=10)
                response.raise_for_status()
                data = response.json()
                return [result.get('description', '') for result in data.get('web', {}).get('results', [])]
            snippets = await asyncio.to_thread(sync_search)
            return "\n".join(snippets) if snippets else "No results found."
        except Exception as e:
            return f"Brave Search failed: {e}"
    
    elif provider == "ddgs":
        print(f"\n[Performing DDGS Search for: {query}]")
        try:
            def sync_search():
                with DDGS() as ddgs:
                    return [r['body'] for r in ddgs.text(query, max_results=5)]
            results = await asyncio.to_thread(sync_search)
            return "\n".join(results) if results else "No results found."
        except Exception as e:
            return f"DDGS search failed: {e}"
    
    return "Invalid search provider specified."

async def get_interaction_summary(full_history: List[Dict]):
    summary_prompt = """/no_think Summarize the key new information, facts, or user preferences from our recent interaction in a single, concise sentence. Focus only on new information. If there is no new key information worth remembering, respond with 'No new key information'."""
    summary_completion = await asyncio.to_thread(client_llm.chat.completions.create, model="local-model", messages=full_history + [{"role": "user", "content": summary_prompt}], temperature=0.0)
    return summary_completion.choices[0].message.content

async def save_memory(interaction_summary: str):
    if not interaction_summary.strip() or "no new key information" in interaction_summary.lower(): return
    summary_embedding = await asyncio.to_thread(embedding_model.encode, [interaction_summary])
    await asyncio.to_thread(collection.add, documents=[interaction_summary], embeddings=[summary_embedding[0].tolist()], ids=[str(datetime.datetime.now().timestamp())])
    print(f"\n[Memory Saved: {interaction_summary}]")

# --- MAIN CHAT LOGIC ENDPOINT ---
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    history = [msg.dict() for msg in request.history]
    
    settings = request.settings if request.settings else SettingsModel()

    if request.continuation:
        action = request.continuation.get("action")
        if action == "approved_search":
            query = request.continuation.get("query")
            search_results = await web_search(query, provider=settings.provider)
            history.append({"role": "tool", "content": f"Here are the search results:\n\n{search_results}\n\nPlease use these results to answer my original question."})
        elif action in ["denied_search", "save_memory", "dont_save_memory"]:
            if action == "denied_search":
                history.append({"role": "user", "content": "The user has denied the web search. Please answer the previous question using only your existing knowledge."})
            elif action == "save_memory":
                await save_memory(request.continuation.get("summary"))
                return {"history": history}
            elif action == "dont_save_memory":
                return {"history": history}
    else:
        user_input = history[-1]['content']
        persona = Path(PERSONA_FILE).read_text()
        profile_data = json.loads(Path(PROFILE_FILE).read_text())
        profile_str = f"--- CORE MEMORY: USER PROFILE ---\nName: {profile_data.get('name', 'N/A')}\nKey Facts: {'; '.join(profile_data.get('key_facts', []))}\nGoals: {'; '.join(profile_data.get('main_goals', []))}\n--- END USER PROFILE ---"
        time_context = f"Current date and time: {datetime.datetime.now().strftime('%A, %B %d, %Y at %I:%M %p')}."
        relevant_memories = await get_relevant_memories(user_input)
        history[0]['content'] = f"{persona}\n\n{profile_str}\n\n{time_context}\n\n{relevant_memories}"


    try:
        completion = await asyncio.to_thread(client_llm.chat.completions.create, model="local-model", messages=history)
        response_text = completion.choices[0].message.content
        history.append({"role": "assistant", "content": response_text})

        confirmation = None
        if settings.webSearchEnabled:
            tool_call_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if tool_call_match:
                try:
                    tool_call_obj = json.loads(tool_call_match.group(0))
                    if tool_call_obj.get("tool_name") == "web_search":
                        confirmation = {"type": "search", "query": tool_call_obj.get("query")}
                except json.JSONDecodeError: pass

        if not confirmation:
            summary = await get_interaction_summary(history[-2:])
            if summary and "no new key information" not in summary.lower():
                confirmation = {"type": "memory", "summary": summary}
        
        return {"history": history, "confirmation": confirmation}
    except Exception as e:
        print(f"An error occurred with the LLM API call: {e}")
        history.append({"role": "assistant", "content": "Sorry, I encountered an error."})
        return {"history": history}

# --- Other API Endpoints (Persona, Profile, Chat Management) ---
@app.get("/api/persona")
async def get_persona():
    return {"persona": Path(PERSONA_FILE).read_text()}
@app.put("/api/persona")
async def update_persona(request: PersonaRequest):
    Path(PERSONA_FILE).write_text(request.persona)
    return {"message": "Persona updated successfully"}
@app.get("/api/profile")
async def get_profile():
    return json.loads(Path(PROFILE_FILE).read_text())
@app.put("/api/profile")
async def update_profile(request: ProfileRequest):
    Path(PROFILE_FILE).write_text(request.model_dump_json(indent=4))
    return {"message": "Profile updated successfully"}
@app.get("/api/chats")
async def get_all_chats():
    conn = sqlite3.connect(DB_FILE); conn.row_factory = sqlite3.Row; cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM chats ORDER BY created_at DESC")
    chats = [{"id": row["id"], "title": row["title"]} for row in cursor.fetchall()]; conn.close(); return chats
@app.post("/api/chats")
async def save_chat(chat_data: SaveChatRequest):
    conn = sqlite3.connect(DB_FILE); cursor = conn.cursor()
    messages_json = json.dumps([msg.dict() for msg in chat_data.messages])
    cursor.execute("INSERT INTO chats (title, messages) VALUES (?, ?)", (chat_data.title, messages_json))
    new_chat_id = cursor.lastrowid; conn.commit(); conn.close()
    return {"id": new_chat_id, "title": chat_data.title}
@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: int):
    conn = sqlite3.connect(DB_FILE); conn.row_factory = sqlite3.Row; cursor = conn.cursor()
    cursor.execute("SELECT messages FROM chats WHERE id = ?", (chat_id,))
    row = cursor.fetchone(); conn.close()
    if not row: raise HTTPException(status_code=404, detail="Chat not found")
    return {"messages": json.loads(row["messages"])}
@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: int):
    conn = sqlite3.connect(DB_FILE); cursor = conn.cursor()
    cursor.execute("DELETE FROM chats WHERE id = ?", (chat_id,)); conn.commit(); conn.close()
    return {"message": "Chat deleted successfully"}