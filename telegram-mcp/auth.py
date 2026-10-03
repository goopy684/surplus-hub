"""최초 인증용 스크립트."""
import asyncio
from telethon import TelegramClient

async def main():
    client = TelegramClient("telegram_session", 29735209, "45a313f25e70ef593d671ffc529b93ce")
    await client.start()
    print("인증 완료!")
    await client.disconnect()

asyncio.run(main())
