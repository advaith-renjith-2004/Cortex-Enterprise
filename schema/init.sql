-- ============================================================================
-- NerveCore ERP System Database Initialization Script
-- Designed for PostgreSQL with pgvector for Relational and Semantic Search
-- ============================================================================

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. HUMAN RESOURCES (HR) & ADMINISTRATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    department VARCHAR(100) NOT NULL CHECK (department IN ('HR', 'Accounting', 'Marketing', 'Production', 'QA', 'Administration')),
    role VARCHAR(100) NOT NULL,
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    attendance_id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Half-Day', 'On-Leave')),
    check_in_time TIME,
    check_out_time TIME,
    notes TEXT,
    UNIQUE(employee_id, date)
);

CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_employee ON attendance(employee_id);

-- ============================================================================
-- 2. ACCOUNTING & CHARTERED ACCOUNTANCY (CA)
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts_ledger (
    ledger_id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    account_name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    type VARCHAR(10) NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    category VARCHAR(100) NOT NULL, -- e.g., 'Travel', 'Office Supplies', 'Capital Expenditure'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchasing_logs (
    purchase_id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    total_amount NUMERIC(15, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    department VARCHAR(100) NOT NULL REFERENCES employees(department) ON DELETE SET NULL OR UPDATE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tax_rules (
    rule_id SERIAL PRIMARY KEY,
    country_state VARCHAR(100) NOT NULL,
    tax_name VARCHAR(150) NOT NULL,
    tax_rate_percentage NUMERIC(5, 2) NOT NULL CHECK (tax_rate_percentage >= 0 AND tax_rate_percentage <= 100),
    description TEXT,
    effective_from DATE NOT NULL,
    effective_to DATE,
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_ledger_date ON accounts_ledger(transaction_date);
CREATE INDEX idx_ledger_category ON accounts_ledger(category);
CREATE INDEX idx_purchasing_date ON purchasing_logs(purchase_date);
CREATE INDEX idx_tax_rules_country_state ON tax_rules(country_state);

-- ============================================================================
-- 3. MARKETING
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    campaign_id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL,
    budget NUMERIC(15, 2) NOT NULL CHECK (budget >= 0),
    status VARCHAR(50) NOT NULL CHECK (status IN ('Planning', 'Active', 'Paused', 'Completed')),
    start_date DATE NOT NULL,
    end_date DATE,
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS copy_assets (
    asset_id SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES marketing_campaigns(campaign_id) ON DELETE CASCADE,
    channel VARCHAR(100) NOT NULL, -- e.g., 'Social Media', 'Email', 'Web', 'Print'
    headline VARCHAR(255) NOT NULL,
    body_text TEXT NOT NULL,
    target_demographic VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX idx_copy_assets_campaign ON copy_assets(campaign_id);

-- ============================================================================
-- 4. PRODUCTION & QUALITY ASSURANCE (QA)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mechanical_frameworks (
    framework_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    specification TEXT NOT NULL,
    design_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    designer VARCHAR(150) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Drafting', 'In-Review', 'Approved', 'Obsolete')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_criteria (
    criteria_id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    test_type VARCHAR(100) NOT NULL, -- e.g., 'Thermal Stress', 'Tensile Strength', 'Circuit Continuity'
    criteria_description TEXT NOT NULL,
    tolerance_limits VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Technical Testing Logs (Structured metadata with Unstructured log texts semantic search)
CREATE TABLE IF NOT EXISTS technical_testing_logs (
    log_id SERIAL PRIMARY KEY,
    log_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    component_id VARCHAR(100) NOT NULL,
    testing_engineer VARCHAR(150) NOT NULL,
    text_log TEXT NOT NULL,
    -- 1024 dimension is common for high-performance embeddings such as NVIDIA NV-Embed or NeMo models
    log_embedding vector(1024),
    test_result VARCHAR(20) NOT NULL CHECK (test_result IN ('PASS', 'FAIL', 'INCONCLUSIVE'))
);

CREATE INDEX idx_frameworks_status ON mechanical_frameworks(status);
CREATE INDEX idx_qa_criteria_product ON qa_criteria(product_name);
CREATE INDEX idx_testing_logs_timestamp ON technical_testing_logs(log_timestamp);

-- Create HNSW Index for ultra-low latency semantic search (pgvector 0.5.0+)
-- Uses cosine distance operator (<=>). Inner product (<#>) or L2 distance (<->) can also be used.
CREATE INDEX IF NOT EXISTS idx_testing_logs_hnsw_cosine 
ON technical_testing_logs 
USING hnsw (log_embedding vector_cosine_ops);

-- ============================================================================
-- 5. GENERAL DATA ENTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS general_data_entry (
    entry_id SERIAL PRIMARY KEY,
    form_name VARCHAR(150) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    field_value TEXT NOT NULL,
    logged_by VARCHAR(150) NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_general_data_form ON general_data_entry(form_name);
CREATE INDEX idx_general_data_key ON general_data_entry(field_key);
