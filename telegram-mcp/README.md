# Telegram MCP Server

Telethon 기반 Telegram 대화 조회/분석 MCP 서버.

## 설정

### 1. Telegram API 키 발급

1. https://my.telegram.org/apps 접속
2. API ID와 API Hash 발급

### 2. 환경변수

```bash
cp .env.example .env
# .env 파일에 API_ID, API_HASH 입력
```

### 3. 의존성 설치

```bash
cd telegram-mcp
pip install -e .
```

### 4. 최초 인증 (1회)

```bash
python server.py
# 터미널에서 전화번호 + 인증코드 입력
# 이후 telegram_session 파일이 생성되어 재인증 불필요
```

### 5. Claude Code에 등록

`~/.claude/settings.json`에 추가:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "python",
      "args": ["/absolute/path/to/telegram-mcp/server.py"],
      "env": {
        "TELEGRAM_API_ID": "your_id",
        "TELEGRAM_API_HASH": "your_hash"
      }
    }
  }
}
```

## 제공 도구

| Tool | 설명 |
|------|------|
| `list_dialogs` | 대화 목록 조회 |
| `get_messages` | 특정 대화방 메시지 가져오기 (날짜/검색 필터) |
| `get_chat_info` | 대화방 상세 정보 |
| `get_participants` | 참여자 목록 |
| `search_messages` | 전체/특정 대화방 메시지 검색 |
| `get_message_stats` | 메시지 통계 (발신자별, 시간대별, 일별) |
