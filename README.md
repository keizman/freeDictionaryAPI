# Enhanced Dictionary API

基于 ECDICT 本地词典的增强版词典 API，支持 340万+ 英汉词条、可选本地 SQLite 词典增强、Redis 缓存，统一响应格式。

## 功能特性

- ✅ **ECDICT 本地词典** - 340万词条，无需网络即可查询
- ✅ **Oxford EN-EN 增强** - `en` 查询可用 `oxford_en_mac` 覆盖英英 definitions
- ✅ **多语双向词典** - 可选 `ko/ja/de/ru <-> en` 本地词库
- ✅ **Google API Fallback** - 本地未找到时自动回退到 Google
- ✅ **Redis 缓存** - 自动缓存远程查询结果，支持命中统计
- ✅ **统一响应格式** - 中英双解，词形变化，词频信息
- ✅ **完整日志** - 所有操作可追溯

## 快速开始

### 1. 环境要求

- Node.js 18+
- Redis (可选，用于缓存)
- 约 1GB 磁盘空间 (数据库 735MB)

### 2. 安装依赖

```bash
git clone <this-repo>
cd freeDictionaryAPI
npm install
```

### 3. 准备数据库

**方式一：下载预构建数据库 (推荐)**

从 [Release 页面](../../releases) 下载 `ecdict.db`，放入 `data/` 目录。

**方式二：自行迁移**

1. 从 [ECDICT Release](https://github.com/skywind3000/ECDICT/releases) 下载 `stardict.csv` (解压 stardict.7z)
2. 运行迁移脚本：

```bash
npx ts-node scripts/migrate.ts ./stardict.csv ./data/ecdict.db
```

迁移约需 1 分钟，生成 735MB 数据库。

### 4. 配置

复制配置模板并填入您的值：

```bash
cp src/config.example.ts src/config.ts
```

编辑 `src/config.ts`:

```typescript
const config: Config = {
  redis: {
    // Redis 连接字符串 (可选，不配置则禁用缓存)
    connectionString: 'redis://default:password@host:port/db',
    defaultTTLDays: 30,
  },
  ecdict: {
    dbPath: './data/ecdict.db',
  },
  server: {
    port: 3000,
  },
  localDicts: {
    oxford_en_mac: { enabled: false, dbPath: './data/oxford_en_mac.sqlite' },
    koen_mac: { enabled: false, dbPath: './data/koen_mac.sqlite' },
    jaen_mac: { enabled: false, dbPath: './data/jaen_mac.sqlite' },
    deen_mac: { enabled: false, dbPath: './data/deen_mac.sqlite' },
    ruen_mac: { enabled: false, dbPath: './data/ruen_mac.sqlite' },
  },
};
```

### 5. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式 (先构建)
npm run build
npm start
```

## API 使用

### 健康检查

```bash
GET /health
```

响应:
```json
{
  "status": "ok",
  "ecdict": 3402564,
  "timestamp": "2026-01-19T12:00:00.000Z"
}
```

### 查询单词

```bash
GET /api/v2/entries/en/{word}
```

示例:
```bash
curl http://localhost:3000/api/v2/entries/en/hello
```

多语词典示例:
```bash
curl http://localhost:3000/api/v2/entries/ko/안녕
curl http://localhost:3000/api/v2/entries/ko/hello
curl http://localhost:3000/api/v2/entries/de/über
```

### 响应格式

```json
{
  "word": "hello",
  "phonetics": { "uk": "hә'lәu", "us": "hә'lәu" },
  "audio": { "uk": "", "us": "" },
  "translations": [
    { "pos": "interj.", "meanings": ["喂", "嘿"] }
  ],
  "definitions": [
    {
      "partOfSpeech": "noun",
      "definition": "an expression of greeting",
      "example": "",
      "synonyms": [],
      "antonyms": []
    }
  ],
  "exchange": {
    "past": "",
    "pastParticiple": "",
    "presentParticiple": "",
    "thirdPerson": "",
    "plural": "hellos",
    "comparative": "",
    "superlative": "",
    "lemma": ""
  },
  "frequency": {
    "collins": 3,
    "oxford": 1,
    "bnc": 2319,
    "frq": 2238,
    "tag": ["zk", "gk"]
  },
  "source": "ecdict",
  "cached": false,
  "detailUrl": "https://dict.eudic.net/dicts/en/hello"
}
```

### Source 字段说明

| 值 | 含义 |
|---|------|
| `ecdict` | 来自本地 ECDICT 词典 |
| `ecdict+oxford` | `en` 查询：中译/词形来自 ECDICT，英英 definitions 来自 Oxford |
| `oxford_en_mac` | 仅命中 Oxford 本地词典 |
| `koen_mac` | 韩英双向本地词典 |
| `jaen_mac` | 日英双向本地词典 |
| `deen_mac` | 德英双向本地词典 |
| `ruen_mac` | 俄英双向本地词典 |
| `google` | 来自 Google API (fallback) |
| `cache` | 来自 Redis 缓存 |

## 当前词库与语向

| 词库文件 | 语向 |
|---|---|
| `ecdict.db` | `En -> Cn` |
| `oxford_en_mac.sqlite` | `En -> En` |
| `koen_mac.sqlite` | `Ko <-> En` |
| `jaen_mac.sqlite` | `Ja <-> En` |
| `deen_mac.sqlite` | `De <-> En` |
| `ruen_mac.sqlite` | `Ru <-> En` |

查询策略:
- `language=en`：先查 ECDICT；若启用并命中 `oxford_en_mac`，仅覆盖 `definitions`；若本地都未命中，fallback 到 Google。
- `language=ko/ja/de/ru`：先查对应本地双向词典；未命中再 fallback 到 Google。
- Redis 缓存保留最终 Google fallback 结果。

## 生产部署

### 使用 PM2

```bash
npm run build
pm2 start dist/app.js --name dict-api
```

### 使用 Docker (可选)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY data ./data
EXPOSE 3000
CMD ["node", "dist/app.js"]
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name dict.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 项目结构

```
freeDictionaryAPI/
├── src/
│   ├── app.ts                 # 主应用入口
│   ├── config.ts              # 配置 (需自行创建)
│   ├── config.example.ts      # 配置模板
│   ├── core/                  # 核心基础设施
│   │   ├── types.ts           # 统一类型定义
│   │   ├── redis.ts           # Redis 客户端
│   │   └── cache.ts           # 缓存服务
│   ├── providers/             # 词典提供者 (可扩展)
│   │   ├── base.ts            # Provider 接口 + Registry
│   │   ├── ecdict/            # ECDICT 英汉词典
│   │   │   ├── index.ts       # Provider 实现
│   │   │   ├── database.ts    # SQLite 操作
│   │   │   └── parser.ts      # 字段解析
│   │   ├── sqlite-dicts/      # 本地 SQLite 词典 (Oxford/KoEn/JaEn/DeEn/RuEn)
│   │   │   ├── index.ts       # Provider 实现
│   │   │   └── database.ts    # SQLite 操作
│   │   └── google/            # Google 词典 (fallback)
│   │       └── index.ts
│   └── routes/                # API 路由
│       └── dictionary.ts
├── scripts/
│   └── migrate.ts             # CSV → SQLite 迁移
├── data/
│   └── ecdict.db              # SQLite 数据库
├── modules/                   # 原版 Google API 模块 (legacy)
├── tsconfig.json
└── package.json
```

## 扩展新词典

添加新词典只需：

1. 创建 `src/providers/xxx/index.ts`
2. 实现 `DictionaryProvider` 接口
3. 在 `app.ts` 中注册：

```typescript
import { createXxxProvider } from './providers/xxx';

const xxxProvider = createXxxProvider(options);
registry.register(xxxProvider, priority); // priority 越高越优先
```

## 数据来源

- [ECDICT](https://github.com/skywind3000/ECDICT) - 免费开源英汉词典数据库

## License

ISC
