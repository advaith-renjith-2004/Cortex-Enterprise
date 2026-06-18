import uvicorn

if __name__ == "__main__":
    # Start FastAPI server on port 8000. 
    # Reload option is enabled for developer iteration.
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
