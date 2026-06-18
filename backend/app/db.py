import logging
from contextlib import contextmanager
from typing import Generator, List, Dict, Any, Optional
import psycopg
from psycopg.rows import dict_row
from pgvector.psycopg import register_vector
from app.config import settings

logger = logging.getLogger("nervecore.db")

@contextmanager
def get_db_connection() -> Generator[psycopg.Connection, None, None]:
    """
    Establishes a connection to the PostgreSQL database, registers pgvector,
    and manages transaction lifecycle. Safe for multi-threaded/local server context.
    """
    conn = psycopg.connect(settings.database_url, row_factory=dict_row)
    try:
        # Register pgvector handlers on the connection so list/numpy types map automatically
        register_vector(conn)
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database transaction error: {e}")
        raise e
    finally:
        conn.close()

def check_db_health() -> bool:
    """Verifies connection and ensures vector extension is enabled."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector';")
                has_vector = cur.fetchone()
                return has_vector is not None
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return False

# ============================================================================
# HR DEPARTMENT DATA QUERIES
# ============================================================================

def query_employee_records(
    name_query: Optional[str] = None, 
    department: Optional[str] = None,
    active_only: bool = True
) -> List[Dict[str, Any]]:
    """
    Safely retrieves employee profiles based on name and/or department.
    Guaranteed SQL Injection free.
    """
    query = """
        SELECT employee_id, first_name, last_name, email, phone, department, role, hire_date, is_active
        FROM employees
        WHERE 1=1
    """
    params = []
    
    if name_query:
        query += " AND (first_name ILIKE %s OR last_name ILIKE %s)"
        like_pattern = f"%{name_query}%"
        params.extend([like_pattern, like_pattern])
        
    if department:
        query += " AND department = %s"
        params.append(department)
        
    if active_only:
        query += " AND is_active = TRUE"
        
    query += " ORDER BY last_name, first_name"
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

def query_attendance_by_employee(
    employee_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Safely retrieves attendance details for a specific employee."""
    query = """
        SELECT a.attendance_id, e.first_name, e.last_name, a.date, a.status, a.check_in_time, a.check_out_time, a.notes
        FROM attendance a
        JOIN employees e ON a.employee_id = e.employee_id
        WHERE a.employee_id = %s
    """
    params = [employee_id]
    
    if start_date:
        query += " AND a.date >= %s"
        params.append(start_date)
    if end_date:
        query += " AND a.date <= %s"
        params.append(end_date)
        
    query += " ORDER BY a.date DESC"
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

# ============================================================================
# ACCOUNTING & FINANCE DEPARTMENT QUERIES
# ============================================================================

def query_ledger_records(
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """Retrieves transactional ledger items using parameterized filtering."""
    query = """
        SELECT ledger_id, transaction_date, account_name, description, amount, type, category
        FROM accounts_ledger
        WHERE 1=1
    """
    params = []
    
    if category:
        query += " AND category ILIKE %s"
        params.append(f"%{category}%")
    if transaction_type:
        query += " AND type = %s"
        params.append(transaction_type.upper())
    if start_date:
        query += " AND transaction_date >= %s"
        params.append(start_date)
    if end_date:
        query += " AND transaction_date <= %s"
        params.append(end_date)
        
    query += " ORDER BY transaction_date DESC, ledger_id DESC LIMIT %s"
    params.append(limit)
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

def query_purchasing_logs(
    supplier_query: Optional[str] = None,
    department: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """Retrieves corporate purchases for auditability."""
    query = """
        SELECT purchase_id, item_name, supplier_name, unit_price, quantity, total_amount, purchase_date, department
        FROM purchasing_logs
        WHERE 1=1
    """
    params = []
    if supplier_query:
        query += " AND supplier_name ILIKE %s"
        params.append(f"%{supplier_query}%")
    if department:
        query += " AND department = %s"
        params.append(department)
        
    query += " ORDER BY purchase_date DESC LIMIT %s"
    params.append(limit)
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

# ============================================================================
# MARKETING DEPARTMENT QUERIES
# ============================================================================

def query_marketing_campaigns(
    status: Optional[str] = None,
    campaign_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieves campaign budgets and operational states."""
    query = """
        SELECT campaign_id, campaign_name, budget, status, start_date, end_date
        FROM marketing_campaigns
        WHERE 1=1
    """
    params = []
    if status:
        query += " AND status = %s"
        params.append(status)
    if campaign_name:
        query += " AND campaign_name ILIKE %s"
        params.append(f"%{campaign_name}%")
        
    query += " ORDER BY start_date DESC"
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

# ============================================================================
# PRODUCTION & QA: SEMANTIC VECTOR SEARCH LOGS
# ============================================================================

def insert_testing_log(
    component_id: str,
    testing_engineer: str,
    text_log: str,
    log_embedding: List[float],
    test_result: str
) -> int:
    """Inserts a new technical log with its vector embedding representation."""
    query = """
        INSERT INTO technical_testing_logs (component_id, testing_engineer, text_log, log_embedding, test_result)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING log_id;
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (component_id, testing_engineer, text_log, log_embedding, test_result))
            row = cur.fetchone()
            return row['log_id'] if row else -1

def semantic_search_testing_logs(
    query_embedding: List[float],
    limit: int = 5,
    min_similarity: float = 0.4
) -> List[Dict[str, Any]]:
    """
    Performs a vector search on unstructured test logs using pgvector cosine distance operator.
    We convert the cosine distance (0 means identical, 2 means opposites) to similarity score:
    Similarity = 1 - Cosine Distance
    """
    # Note: pgvector <=> computes cosine distance
    query = """
        SELECT log_id, log_timestamp, component_id, testing_engineer, text_log, test_result,
               (1.0 - (log_embedding <=> %s)) AS similarity_score
        FROM technical_testing_logs
        WHERE (1.0 - (log_embedding <=> %s)) >= %s
        ORDER BY log_embedding <=> %s ASC
        LIMIT %s;
    """
    # We pass the embedding list, psycopg and pgvector mapping handles serialization to PG vector type.
    params = [query_embedding, query_embedding, min_similarity, query_embedding, limit]
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
