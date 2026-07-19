@echo off
cd /d "c:\Users\mayur\Downloads\AppDevelopment\ca-saas\services\extractor"
REM Set your OpenRouter API key here or in system environment variables
REM set OPENROUTER_API_KEY=your-api-key-here
set OPENROUTER_MODEL=deepseek/deepseek-v4-flash
set OPENROUTER_MODEL_FALLBACK=google/gemini-2.5-flash-lite
set EXTRACT_USE_OPENROUTER_ONLY=true
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
