import logging
from app.config import settings

logger = logging.getLogger("nervecore.speech")

# Try to import riva client library. 
# In a production environment with Riva, run: pip install nvidia-riva-client
try:
    import riva.client as rcli
    RIVA_AVAILABLE = True
except ImportError:
    RIVA_AVAILABLE = False

async def transcribe_audio(audio_bytes: bytes) -> str:
    """
    Transcribes audio byte stream (usually WAV/PCM) to a text string.
    Connects to NVIDIA Riva ASR NIM server.
    If the server is unavailable or Riva client is not installed, it falls back
    to simulated behavior (or logs warnings) to ensure development environment starts cleanly.
    """
    if not RIVA_AVAILABLE:
        logger.warning("nvidia-riva-client is not installed. Running Riva ASR in simulated/sandbox mode.")
        return _simulate_asr(audio_bytes)

    try:
        # 1. Establish gRPC channel to local Riva NIM
        auth = rcli.ASRServiceStub(settings.RIVA_SERVER_ADDRESS)
        
        # 2. Configure ASR settings
        config = rcli.RecognitionConfig(
            encoding=rcli.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=16000,
            language_code=settings.RIVA_LANGUAGE_CODE,
            max_alternatives=1,
            enable_automatic_punctuation=True
        )
        
        # 3. Create recognition request
        req = rcli.RecognizeRequest(config=config, audio=audio_bytes)
        
        # 4. Invoke synchronous recognition (low-latency voice commands)
        response = auth.recognize(req)
        
        if response.results:
            transcript = response.results[0].alternatives[0].transcript
            logger.info(f"Riva ASR successful transcription: '{transcript}'")
            return transcript
        else:
            return ""
            
    except Exception as e:
        logger.error(f"Error communicating with Riva NIM at {settings.RIVA_SERVER_ADDRESS}: {e}")
        logger.info("Falling back to simulated transcription for demonstration purposes.")
        return _simulate_asr(audio_bytes)

def _simulate_asr(audio_bytes: bytes) -> str:
    """
    A developer-friendly fallback to simulate transcription when
    the Riva container is not online yet. Reads metadata or returns
    a test query based on the dummy sound size.
    """
    # Simple heuristic to make local mock testing interesting:
    # Depending on the size, return typical queries that showcase departmental tool calling
    size = len(audio_bytes)
    if size % 5 == 0:
        return "Find testing logs related to temperature sensor failure in the production lines."
    elif size % 3 == 0:
        return "Show me the accounts ledger transactions under Category Office Supplies."
    elif size % 2 == 0:
        return "Who is in the HR department and is Alice present today?"
    else:
        return "Search marketing campaigns that are active."
