import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # PostgreSQL Configuration
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_NAME: str = "nervecore"

    @property
    def database_url(self) -> str:
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # NVIDIA NIM Configurations (LLM)
    # Llama 3.3 70B Instruct is highly optimized for complex agent reasoning and tool calling.
    NVIDIA_API_KEY: str = "mock-key-for-local-development"
    NVIDIA_NIM_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_LLM_MODEL: str = "meta/llama-3.3-70b-instruct"

    # Embedding NIM Configuration (for pgvector ingestion and search)
    NVIDIA_EMBEDDING_MODEL: str = "nvidia/embeddings-nv-embed-qa-4"
    EMBEDDING_DIMENSION: int = 1024

    # NVIDIA Riva ASR (Speech-to-Text) Configuration
    RIVA_SERVER_ADDRESS: str = "localhost:50051"
    RIVA_LANGUAGE_CODE: str = "en-US"

    # Security Configuration
    API_SECRET_KEY: str = "nervecore-super-secure-local-secret-key-12345"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
