import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any, List
from app.config import settings
from app.db import check_db_health, get_db_connection
from app.speech import transcribe_audio
from app.llm import execute_routing_and_search, get_embedding

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nervecore.main")

app = FastAPI(
    title="NerveCore Secure ERP AI Search Engine",
    description="Local, secure search orchestration utilizing PostgreSQL + pgvector and NVIDIA NIM API.",
    version="1.0.0"
)

# ============================================================================
# API MODELS
# ============================================================================
class SearchQueryRequest(BaseModel):
    query: str

class SearchResponse(BaseModel):
    query: str
    routed_department: str
    tool_used: str
    arguments: Dict[str, Any]
    results: List[Dict[str, Any]]

# ============================================================================
# ENDPOINTS
# ============================================================================

@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": "NerveCore Secure Search Engine",
        "configuration": {
            "llm_model": settings.NVIDIA_LLM_MODEL,
            "embedding_model": settings.NVIDIA_EMBEDDING_MODEL,
            "embedding_dimension": settings.EMBEDDING_DIMENSION,
            "riva_address": settings.RIVA_SERVER_ADDRESS
        }
    }

@app.get("/health")
def health_check():
    db_ok = check_db_health()
    if not db_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database health check failed (verify postgres and pgvector extension)."
        )
    return {"status": "healthy", "database": "connected"}

@app.post("/api/search/text")
async def search_by_text(request: SearchQueryRequest):
    """
    Accepts text queries, routes them via Llama 3.3 70B, and safely queries
    the database using appropriate parameterized sql or pgvector search.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    try:
        outcome = execute_routing_and_search(request.query)
        if "error" in outcome:
            raise HTTPException(status_code=500, detail=outcome["error"])
        return {
            "query": request.query,
            "routed_department": outcome.get("routed_department", "None"),
            "tool_used": outcome.get("tool_used", "None"),
            "arguments": outcome.get("arguments", {}),
            "results": outcome.get("results", [])
        }
    except Exception as e:
        logger.error(f"Search endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search/voice")
async def search_by_voice(file: UploadFile = File(...)):
    """
    Receives voice audio stream (WAV format recommended), transcribes using
    NVIDIA Riva ASR NIM, and passes the transcription to the LLM router.
    """
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload audio.")
        
    try:
        audio_bytes = await file.read()
        
        # 1. Transcribe speech using Riva
        transcript = await transcribe_audio(audio_bytes)
        
        if not transcript:
            return {
                "query": "",
                "routed_department": "None",
                "message": "Speech could not be parsed or recognized by Riva.",
                "results": []
            }
            
        # 2. Feed text query into LLM search orchestrator
        outcome = execute_routing_and_search(transcript)
        
        if "error" in outcome:
            raise HTTPException(status_code=500, detail=outcome["error"])
            
        return {
            "query": transcript,
            "routed_department": outcome.get("routed_department", "None"),
            "tool_used": outcome.get("tool_used", "None"),
            "arguments": outcome.get("arguments", {}),
            "results": outcome.get("results", [])
        }
    except Exception as e:
        logger.error(f"Voice search endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/seed")
def seed_database():
    """
    Seeds the local database with demo data (HR, Accounting, QA, and unstructured vector testing logs).
    Calculates embeddings dynamically using settings.NVIDIA_EMBEDDING_MODEL (or mock vectors).
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. Seed HR Department
                cur.execute("""
                    INSERT INTO employees (first_name, last_name, email, phone, department, role)
                    VALUES 
                        ('Alice', 'Vance', 'alice.vance@nervecore.io', '555-0192', 'QA', 'Lead Test Engineer'),
                        ('Bob', 'Miller', 'bob.miller@nervecore.io', '555-0143', 'Production', 'Mechanical Designer'),
                        ('Charlie', 'Smith', 'charlie.smith@nervecore.io', '555-0188', 'Accounting', 'Senior Auditor')
                    ON CONFLICT (email) DO NOTHING;
                """)
                
                # Fetch employee ids for attendance seeding
                cur.execute("SELECT employee_id, first_name FROM employees;")
                employees = {row['first_name']: row['employee_id'] for row in cur.fetchall()}
                
                # Seed attendance
                cur.execute("""
                    INSERT INTO attendance (employee_id, date, status, check_in_time, check_out_time, notes)
                    VALUES 
                        (%s, CURRENT_DATE, 'Present', '08:58:00', '17:05:00', 'Arrived on schedule'),
                        (%s, CURRENT_DATE, 'Present', '09:15:00', '17:30:00', 'Slightly late due to traffic')
                    ON CONFLICT DO NOTHING;
                """, (employees.get('Alice'), employees.get('Bob')))
                
                # 2. Seed Accounting Ledger
                cur.execute("""
                    INSERT INTO accounts_ledger (transaction_date, account_name, description, amount, type, category)
                    VALUES 
                        (CURRENT_DATE - INTERVAL '1 day', 'Office Supplies Depot', 'Ergonomic chairs for developers', 750.00, 'DEBIT', 'Office Supplies'),
                        (CURRENT_DATE - INTERVAL '2 days', 'CloudHosting Corp', 'Production server hosting fee', 2400.00, 'DEBIT', 'Infrastructure'),
                        (CURRENT_DATE - INTERVAL '3 days', 'Marketing Spark LLC', 'Campaign Retainer Fees', 5000.00, 'DEBIT', 'Advertising')
                    ON CONFLICT DO NOTHING;
                """)
                
                # 3. Seed Marketing Campaigns
                cur.execute("""
                    INSERT INTO marketing_campaigns (campaign_name, budget, status, start_date)
                    VALUES ('NerveCore v2 Launch', 25000.00, 'Active', CURRENT_DATE - INTERVAL '10 days')
                    ON CONFLICT DO NOTHING;
                """)
                
                # 4. Seed QA and Mechanical specifications
                cur.execute("""
                    INSERT INTO mechanical_frameworks (name, specification, design_version, designer, status)
                    VALUES ('Titanium Frame v3', 'Tensile specification grade 5 titanium chassis, max stress load 450MPa', '3.4.1', 'Bob Miller', 'Approved')
                    ON CONFLICT DO NOTHING;
                """)
                
        # 5. Ingest unstructured QA logs (Requires generating vectors)
        logs_to_ingest = [
            {
                "comp_id": "TITAN-CHASSIS-009",
                "eng": "Alice Vance",
                "log": "Thermal stress chamber test started at 50C. Temperature ramped to 85C over 2 hours. Slight metal expansion observed but structural boundaries remained intact. Structural compliance passed.",
                "res": "PASS"
            },
            {
                "comp_id": "PCB-BOARD-A4",
                "eng": "Alice Vance",
                "log": "Circuit continuity check failed on the secondary layer. High resistance noted on trace pin 14. Potential copper bridging causing short circuit under voltage load.",
                "res": "FAIL"
            },
            {
                "comp_id": "TITAN-CHASSIS-010",
                "eng": "Alice Vance",
                "log": "Hydraulic pressure testing exceeded maximum safety tolerance. Chassis suffered deformation at 480MPa loading, breaching safety limits of 450MPa. Redesign required.",
                "res": "FAIL"
            }
        ]
        
        # Calculate embeddings and insert into database
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # First, clear existing testing logs to prevent duplicate listings on repeat seed
                cur.execute("TRUNCATE TABLE technical_testing_logs;")
                
                for item in logs_to_ingest:
                    emb = get_embedding(item["log"])
                    cur.execute("""
                        INSERT INTO technical_testing_logs (component_id, testing_engineer, text_log, log_embedding, test_result)
                        VALUES (%s, %s, %s, %s, %s);
                    """, (item["comp_id"], item["eng"], item["log"], emb, item["res"]))
                    
        return {
            "status": "success",
            "message": "Demo data successfully seeded to human resources, accounting, marketing, and pgvector-enabled testing logs."
        }
    except Exception as e:
        logger.error(f"Seeding failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database seeding failed: {e}")
