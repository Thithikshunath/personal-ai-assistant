import streamlit as st
import chromadb
import pandas as pd
from pathlib import Path
import datetime

# --- CONFIGURATION ---
# Construct an absolute path to the database folder to ensure it's always found
SCRIPT_DIR = Path(__file__).parent
DB_PATH = SCRIPT_DIR / "./AssistantBackend/assistant_memory"
COLLECTION_NAME = "memory"

# --- STREAMLIT PAGE SETUP ---
st.set_page_config(layout="wide", page_title="Assistant Memory Viewer")
st.title("🛠️ Assistant Memory Manager")
st.caption(f"Connected to database at: {DB_PATH}")

# --- DATABASE CONNECTION ---
@st.cache_resource
def load_collection():
    """Connects to the ChromaDB collection."""
    client = chromadb.PersistentClient(path=str(DB_PATH))
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    return collection

try:
    collection = load_collection()

    # --- UI FORMS ---

    # ADD A NEW MEMORY
    with st.expander("➕ Add a New Memory"):
        new_memory_text = st.text_area("Enter the new memory text you want to add:")
        if st.button("Save New Memory"):
            if new_memory_text:
                try:
                    # Generate a unique ID using a timestamp
                    new_id = str(datetime.datetime.now().timestamp())
                    collection.add(documents=[new_memory_text], ids=[new_id])
                    st.success(f"Successfully added new memory with ID: {new_id}")
                    st.cache_resource.clear() # Clear cache to force reload
                    st.rerun()
                except Exception as e:
                    st.error(f"Failed to add memory: {e}")
            else:
                st.warning("Please enter some text for the new memory.")

    # EDIT AN EXISTING MEMORY
    with st.expander("✏️ Edit an Existing Memory"):
        edit_id = st.text_input("Enter the ID of the memory you want to edit:")
        edit_memory_text = st.text_area("Enter the new, updated text for this memory:")
        if st.button("Update Memory"):
            if edit_id and edit_memory_text:
                try:
                    # Update will find the entry by ID and re-calculate the embedding
                    collection.update(ids=[edit_id], documents=[edit_memory_text])
                    st.success(f"Successfully updated memory with ID: {edit_id}")
                    st.cache_resource.clear()
                    st.rerun()
                except Exception as e:
                    st.error(f"Failed to update memory: {e}")
            else:
                st.warning("Please provide both the ID and the new text to update a memory.")

    # DELETE A MEMORY
    with st.expander("🗑️ Delete a Memory"):
        delete_id = st.text_input("Enter the ID of the memory you want to delete:", key="delete_id_input")
        if st.button("Delete Memory"):
            if delete_id:
                try:
                    collection.delete(ids=[delete_id])
                    st.success(f"Successfully deleted memory with ID: {delete_id}")
                    st.cache_resource.clear()
                    st.rerun()
                except Exception as e:
                    st.error(f"Failed to delete memory: {e}")
            else:
                st.warning("Please enter an ID to delete.")

    # --- DISPLAY DATA ---
    st.header("Stored Memories")
    memories = collection.get(include=["documents", "metadatas"])
    
    if not memories or not memories.get('ids'):
        st.warning("No memories found in the collection yet. Have a conversation with the assistant to save some!")
    else:
        df = pd.DataFrame({
            'ID': memories['ids'],
            'Memory Text': memories['documents'],
            'Metadata': [str(m) for m in memories['metadatas']] if memories.get('metadatas') else "None"
        })
        st.dataframe(df, use_container_width=True, height=600)

except Exception as e:
    st.error(f"An error occurred while loading the database: {e}")