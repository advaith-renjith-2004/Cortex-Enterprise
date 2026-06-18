# Cortex Enterprise AI ERP System

Cortex Enterprise is a modern, voice-and-text-activated local search engine integrated into a mini-enterprise ERP. The system leverages local-compute optimizations via NVIDIA NIM APIs alongside Supabase/PostgreSQL for relational and semantic data management.

---

## 🏗️ Architecture Blueprint

```
                      +-----------------------------+
                      |     User Client Prompt      |
                      | (Voice Text / Audio Stream) |
                      +--------------+--------------+
                                     |
                                     v
                  +------------------+------------------+
                  |  LLM Orchestration: Llama 3.3 70B   | <--- NVIDIA NIM
                  |      (Strict Function Calling)      |
                  +--------+-------------------+--------+
                           |                   |
               [Ledger Queries]             [Hardware/QA Queries]
                           |                   |
                           v                   v
             +-------------+----+    +---------+----------+
             |   Supabase Postgres|    | NeMo Embedding NIM |
             |  (Relational ledgers) |    +---------+----------+
             +-------------+----+              | (1024d)
                           |                   v
                           |         +---------+----------+
                           |         |  Supabase pgvector |
                           |         | (HNSW Semantic Search)
                           |         +---------+----------+
                           |                   |
                           +--------+----------+
                                    |
                                    v
                  +-----------------+-------------------+
                  |  Summary Synthesizer: Llama 3.3     | <--- NVIDIA NIM
                  |      (Markdown Report Summary)      |
                  +-----------------+-------------------+
                                    |
                                    v
                           [JSON Response]
```

---

## 🛠️ Technology Stack

- **AI Inference (NVIDIA NIM)**:
  - **Voice Processing**: NVIDIA Riva ASR for speech-to-text.
  - **Orchestration & Tool Routing**: Meta Llama 3.3 70B Instruct.
  - **Vector Embeddings**: NeMo Retriever NIM (`nvidia/embeddings-nv-embed-qa-4` - 1024 dimensions).
- **Database (Supabase / PostgreSQL)**:
  - **Relational Storage**: Normalized transactional ledgers (`NUMERIC(15,2)` for currency) and employee directories.
  - **Vector Semantic Storage**: `pgvector` extension with custom **HNSW index** on cosine distance parameters for unstructured hardware/circuit test logs.
- **Backend Environment**:
  - **Platform**: Node.js & TypeScript.
  - **Framework**: Express.

---

## 📁 Directory Structure

```
.
├── supabase/
│   └── migrations/
│       └── 20260618000000_init.sql # SQL migration setting up tables, pgvector, and search RPC
└── backend/
    ├── package.json               # Node dependencies
    ├── tsconfig.json              # TypeScript compilation rules
    ├── .env.example               # Environmental configuration blueprint
    └── src/
        ├── index.ts               # Express startup script and routes
        ├── config/
        │   ├── nvidia.ts          # NIM client configuration (OpenAI-compatible SDK)
        │   └── supabase.ts        # Supabase JS database wrapper client
        └── services/
            └── orchestrator.ts    # Intent routing, function calls, and synthesis core
```

---

## 🚀 Installation & Setup

### 1. Database Setup (Supabase)
Create a new migration in your Supabase dashboard SQL editor or run the migration script directly:
- Run [supabase/migrations/20260618000000_init.sql](file:///e:/AI_ERP_System/supabase/migrations/20260618000000_init.sql) in your Supabase SQL editor. This activates the `vector` extension, structures database tables, and creates the custom `match_logs` vector search RPC function.

### 2. Configure Environment Variables
Inside the `backend/` folder, copy `.env.example` to `.env` and configure your credentials:
```bash
cp backend/.env.example backend/.env
```
Ensure you set your `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NVIDIA_BUILD_API_KEY`. If keys are left at defaults, the server will execute in a **local mock mode** to let development proceed offline.

### 3. Run the Backend
Install the dependencies and start the local Node server:
```bash
cd backend
npm install
npm run dev
```
The server will boot on `http://localhost:8000`.

---

## 📡 API Endpoints

### 1. Health Status
- **Method**: `GET /health`
- **Description**: Inspects database health.

### 2. Seed Database
- **Method**: `POST /api/seed`
- **Description**: Feeds sample data (employees, ledgers, and unstructured testing logs with generated vectors) into your Supabase database.

### 3. Search Query
- **Method**: `POST /api/query`
- **Payload**:
  ```json
  {
    "userPrompt": "Show me the logs regarding PCB board shorts and high resistance"
  }
  ```
- **Response Structure**:
  ```json
  {
    "routedDepartment": "Production & QA (Semantic Search)",
    "toolUsed": "queryUnstructuredQALogs",
    "arguments": {
      "semanticQuery": "Show me the logs regarding PCB board shorts and high resistance",
      "limit": 5
    },
    "results": [ ... ],
    "summary": "### Cortex Production & QA Report\n\n- **PCB-BOARD-A4**: Lead Engineer Alice Vance reported a failure in circuit continuity..."
  }
  ```
