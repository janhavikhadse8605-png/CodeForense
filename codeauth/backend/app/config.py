"""CodeAuth backend configuration."""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Model
    model_dir: str = "./model_files"
    device: str = "auto"
    model_name: str = "microsoft/codebert-base"

    # Database
    database_url: str = "sqlite:///./codeauth.db"

    # Security
    max_file_size_mb: int = 10
    max_repo_size_mb: int = 100
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def model_path(self) -> Path:
        return Path(self.model_dir)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
