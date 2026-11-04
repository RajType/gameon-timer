//! Error type shared by every command. Serialised to the UI as
//! `{ code, message }`; `message` is user-facing Persian text.

use serde::{Serialize, Serializer, ser::SerializeStruct};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Bad input from the operator (shown as-is).
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    /// The request no longer matches the current state (e.g. a stale preview).
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Backup(String),
    #[error("خطای پایگاه داده: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("خطای فایل: {0}")]
    Io(#[from] std::io::Error),
    #[error("داده‌ی نامعتبر: {0}")]
    Json(#[from] serde_json::Error),
    #[error("خطای داخلی: {0}")]
    Internal(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "validation",
            Self::NotFound(_) => "not_found",
            Self::Conflict(_) => "conflict",
            Self::Backup(_) => "backup",
            Self::Db(_) => "database",
            Self::Io(_) => "io",
            Self::Json(_) => "json",
            Self::Internal(_) => "internal",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

pub fn validation(message: impl Into<String>) -> AppError {
    AppError::Validation(message.into())
}

pub fn conflict(message: impl Into<String>) -> AppError {
    AppError::Conflict(message.into())
}

pub fn not_found(message: impl Into<String>) -> AppError {
    AppError::NotFound(message.into())
}
