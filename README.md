# 🤖 My Personal AI Assistant


*WIP. Use with caution*


This is a full-stack application for a completely local, personal AI assistant. It features a persistent memory, web search capabilities, and a highly customizable personality, all accessible through a modern and responsive web interface.

## ✨ Features

* **Local LLM Integration**: Connects to any local LLM that exposes an OpenAI-compatible API endpoint.
* **Persistent Memory**: Utilizes ChromaDB to give the assistant a long-term memory, allowing it to recall past conversations and facts.
* **Web Search Tools**: Can be configured to use the Brave Search API or DuckDuckGo for real-time information.
* **Deep Personalization**:
    * **Custom Persona**: Edit the assistant's core identity through a detailed system prompt.
    * **User Profile**: The assistant remembers key facts about you, such as your name, interests, and goals.
* **Full Chat Functionality**:
    * Save, load, and delete entire chat histories.
    * Edit any message in the conversation to correct typos or change the conversational path.
    * View the AI's "thinking" process.
* **Modern UI**: A responsive and clean user interface built with React and TypeScript, featuring a dark mode and animated backgrounds.
* **Secure Configuration**: API keys and other secrets are managed securely using an `.env` file.

## 🛠️ Tech Stack

* **Backend**: Python, FastAPI, ChromaDB, Sentence-Transformers
* **Frontend**: React, TypeScript, Vite, React Markdown
* **LLM**: Designed for a local model (e.g., via LM Studio, Ollama)

## 🚀 Getting Started

Follow these instructions to get the project running on your local machine.

### Prerequisites

* Python 3.8+
* Node.js and npm
* A local LLM running with an OpenAI-compatible server (e.g., LM Studio).
* A Brave Search API key (optional, for web search).

### Backend Setup

1.  **Navigate to the backend directory and create a virtual environment:**
    ```bash
    cd /path/to/your/backend
    python -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    ```

2.  **Install the required Python packages:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Configure your API key:**
    * Create a file named `.env` in the backend directory.
    * Add your Brave Search API key to it:
        ```env
        BRAVE_API_KEY="YOUR_BRAVE_API_KEY_HERE"
        ```

4.  **Run the backend server:**
    ```bash
    uvicorn main:app --reload
    ```
    The backend will now be running at `http://localhost:8000`.

### Frontend Setup

1.  **Navigate to the frontend directory in a new terminal:**
    ```bash
    cd /path/to/your/frontend
    ```

2.  **Install the required Node.js packages:**
    ```bash
    npm install
    ```

3.  **Run the frontend development server:**
    ```bash
    npm run dev
    ```
    The frontend will now be running at `http://localhost:5173` (or a similar address). Open this URL in your browser to start chatting with your assistant!
