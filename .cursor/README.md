# Cursor — proje rolleri (Rules)

Bu klasör **repoya dahildir**. Cursor’da kullanılan kurallar `.cursor/rules/` altındaki `.mdc` dosyalarıdır.

## Yapı

| Klasör / dosya | Açıklama |
|----------------|----------|
| `rules/*.mdc` | Agent ve araç kuralları (Türkçe encoding, Ant Design, şema senkronu, güvenlik vb.) |

Yeni kural eklediğinizde dosyayı `rules/` içine koyup commit + push edin; böylece tüm ekip aynı rolleri kullanır.

## Mevcut kural dosyaları (özet)

- **Agent:** muhasebe, backend API, DevOps, performans, principal engineer, güvenlik, mimari, Tauri build, teknik yazar, tester, UI tasarım
- **Proje:** `retailex-project-context.mdc`, `database-master-schema-sync.mdc`, `turkish-encoding-safety.mdc`, `ui-flat-modal-standard.mdc`
- **Araçlar:** Ant Design, AWS (agentic, CDK, cost, MCP, serverless EDA), superpowers code reviewer

> **Not:** Kullanıcı genel Cursor ayarları (`%USERPROFILE%\.cursor\`) burada değil; sadece **bu repoya özel** kurallar bu dizindedir.
