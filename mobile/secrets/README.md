# Play / EAS secrets (yerel)

Bu klasör **gitignore** altındadır. Service account JSON **asla commit edilmez**.

## Beklenen dosya (isteğe bağlı)

| Dosya | Açıklama |
|-------|----------|
| `google-play-service-account.json` | Google Play Developer API service account key |

EAS dashboard’a key yüklediyseniz bu dosya **gerekmez**. Ayrıntı: [`../PLAY_SUBMIT.md`](../PLAY_SUBMIT.md).

```bash
# Örnek — Google Cloud Console'dan indirdiğiniz key'i buraya kopyalayın
cp ~/Downloads/your-project-xxxxx.json ./google-play-service-account.json
```
