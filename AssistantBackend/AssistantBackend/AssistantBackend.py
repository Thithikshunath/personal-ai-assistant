import openai
import chromadb
from sentence_transformers import SentenceTransformer
from ddgs import DDGS
import json
import re
import datetime 

# --- 1. INITIALIZE SERVICES ---
client_db = chromadb.PersistentClient(path="assistant_memory")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
collection = client_db.get_or_create_collection(name="memory", metadata={"hnsw:space": "cosine"})
client_llm = openai.OpenAI(base_url="http://localhost:15211/v1", api_key="not-needed")

# --- NEW: Updated system prompt mentioning the date/time context ---
system_prompt = """You are an intelligent assistant. You must provide well-reasoned answers that are both correct and helpful.
The user will provide the current date and time for context at the start of each conversation.
You have access to a tool to search the web for recent or specific information you don't know.
To use the tool, you MUST respond with ONLY a JSON object in the following format:
{"tool_name": "web_search", "query": "your concise and specific search query here"}

**GUIDELINES FOR SEARCHING:**
- Be specific. Instead of "current president", search for "who is president of the United States as of August 2025".
- Use full names and context from the user's question in your search query.

Only use the tool for recent events or facts you don't know. Otherwise, answer from your own knowledge, using the 'PAST MEMORIES' for context."""

history = [{"role": "system", "content": system_prompt}]

# --- 2. HELPER FUNCTIONS ---
def get_relevant_memories(prompt, top_k=3):
    if collection.count() == 0: return ""
    prompt_embedding = embedding_model.encode([prompt])[0].tolist()
    results = collection.query(query_embeddings=[prompt_embedding], n_results=top_k)
    if not results['documents'][0]: return ""
    memories = "\n".join(results['documents'][0])
    return f"--- PAST MEMORIES ---\n{memories}\n--- END MEMORIES ---"

def save_memory(interaction_summary):
    if not interaction_summary.strip() or "no new key information" in interaction_summary.lower(): return
    summary_embedding = embedding_model.encode([interaction_summary])[0].tolist()
    collection.add(documents=[interaction_summary], embeddings=[summary_embedding], ids=[interaction_summary])
    print(f"\n[Memory Saved: {interaction_summary}]")

def get_interaction_summary(full_history):
    summary_prompt = """Summarize the key information, facts, or user preferences from our recent interaction in a single, concise sentence. 
                        If there is no new key information worth remembering, respond with 'No new key information'. Only save information that you got from
                        a websearch or from user. What you can figure out from yourself such as ansers to generic questions which you figured out without websearch
                        as well as anything already available in 'PAST MEMORIES' or available in system prompt such as dateime should not be saved as memory management is important."""
    summary_completion = client_llm.chat.completions.create(model="local-model", messages=full_history + [{"role": "user", "content": summary_prompt}], temperature=0.0)
    return summary_completion.choices[0].message.content

def web_search(query):
    print(f"\n[Performing web search for: {query}]")
    with DDGS() as ddgs:
        results = [r['body'] for r in ddgs.text(query, max_results=5)]
    return "\n".join(results)

# --- 3. MAIN CHAT LOOP ---
print("Chat with your local AI assistant! Type 'quit' to exit.")
while True:
    user_input = input("👤 You: ")
    if user_input.lower() == 'quit': break

    history.append({"role": "user", "content": user_input})

    # --- NEW: Get current time and build the full context for this turn ---
    current_time_str = datetime.datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")
    time_context = f"Current date and time: {current_time_str}."
    
    relevant_memories = get_relevant_memories(user_input)
    
    # Save the original system prompt before modifying it for the turn
    original_system_prompt = history[0]['content']
    
    # Build the contextual system prompt for this specific turn
    contextual_system_prompt = f"{system_prompt}\n{time_context}\n{relevant_memories}"
    history[0]['content'] = contextual_system_prompt
    
    # --- Tool Use & Confirmation Loop ---
    while True:
        completion = client_llm.chat.completions.create(model="local-model", messages=history)
        response_text = completion.choices[0].message.content
        history.append({"role": "assistant", "content": response_text})

        tool_call_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if tool_call_match:
            tool_call_str = tool_call_match.group(0)
            try:
                tool_call_obj = json.loads(tool_call_str)
                if tool_call_obj.get("tool_name") == "web_search":
                    query = tool_call_obj.get("query")
                    
                    confirm_search = input(f"\n[AI wants to search for: '{query}']\n> Allow web search? (y/n): ")
                    if confirm_search.lower() == 'y':
                        search_results = web_search(query)
                        tool_feedback_prompt = f"Here are the search results:\n\n{search_results}\n\nPlease use these results to answer my original question."
                        history.append({"role": "user", "content": tool_feedback_prompt})
                        continue 
                    else:
                        print("[Web search denied.]")
                        denial_prompt = "The user has denied the web search. Please answer the previous question using only your existing knowledge and the memories provided."
                        history.append({"role": "user", "content": denial_prompt})
                        continue
            except json.JSONDecodeError:
                pass
        
        break
    
    final_answer = history[-1]['content']
    print("🤖 Assistant: " + final_answer)

    summary = get_interaction_summary(history[-2:])
    if summary and "no new key information" not in summary.lower():
        confirm_memory = input(f"\n[AI wants to save: '{summary}']\n> Save this memory? (y/n): ")
        if confirm_memory.lower() == 'y':
            save_memory(summary)
        else:
            print("[Memory not saved.]")

    # Reset the system prompt to its clean, original state for the next turn
    history[0]['content'] = original_system_prompt