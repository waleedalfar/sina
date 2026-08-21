import time
import uuid

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    # `model` is accepted for OpenAI-client compatibility but ignored —
    # routing is entirely determined by the X-Application-Id header, never
    # by client-supplied content, so there's nothing for this field to
    # bypass even if a caller sets it to something else.
    model: str | None = None
    messages: list[ChatMessage]
    max_tokens: int | None = None
    stream: bool = False  # non-streaming only for MVP 0.1; True is rejected


class ChatCompletionChoiceMessage(BaseModel):
    role: str
    content: str


class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatCompletionChoiceMessage
    finish_reason: str = "stop"


class ChatCompletionUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionResponse(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4().hex}")
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: list[ChatCompletionChoice]
    usage: ChatCompletionUsage


class ModelListEntry(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str = "hospital-platform"


class ModelListResponse(BaseModel):
    object: str = "list"
    data: list[ModelListEntry]
