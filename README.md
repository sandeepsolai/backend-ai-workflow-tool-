
# 📧 Custom Email Workflow Tool - Backend

This is the **backend service** for the Custom Email Workflow Tool.  
It provides secure REST APIs for authentication, email management, AI-powered reply suggestions, and Google Calendar scheduling.

---

## 🚀 Features

- **User Authentication** with JWT
- **Email Management** (fetch, classify, reply)
- **AI-Powered Reply Suggestions** with priority scoring
- **Google Calendar Integration** with timezone support
- **MongoDB Persistence** with clean schema design
- **Robust Middleware** for authentication, validation, and error handling
- **Clean MVC Architecture** with services, controllers, and routes

---

## 🛠️ Tech Stack

- **Backend Framework**: [Express.js](https://expressjs.com/) (with TypeScript)
- **Database**: [MongoDB](https://www.mongodb.com/)
- **Authentication**: Google Oauth
- **API Style**: RESTful
- **Code Principles**: SOLID, MVC Pattern

---

## 📂 Project Structure

```
backend/
│── src/
│ │── api/
│ │ ├── controllers/ # Route handlers (no business logic)
│ │ ├── middleware/ # Auth, validation, error handling
│ │ ├── routes/ # REST API endpoints
│ │ ├── services/ # Business logic & rules
│ │ ├── models/ # MongoDB schemas (User, Email)
│ │
│ ├── config/ # Environment & server configurations
│ ├── types/ # TypeScript types & interfaces
│ ├── utils/ # Reusable helpers & utilities
│ └── index.ts # Server entry point
│
│── package.json
│── tsconfig.json
└── README.md
```

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/sandeepsolai/backend-ai-workflow-tool-.git
cd custom-email-workflow-tool/backend
```

### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Configure Environment Variables
Create a `.env` file in the `backend/` directory:

```env
PORT=5000
MONGO_URI=mongodb+srv://<your-db-uri>
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_google_redirect_uri
```

### 4️⃣ Run the Server
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

Server will start at: **http://localhost:5000**

---

## 🔑 Authentication

- Uses **Google tokens** in the `Authorization` header.
- Format:  
  ```
  Authorization: Bearer <your_token>
  ```

---

## 📚 API Documentation

### Auth Routes
| Method | Endpoint           | Description                  | Auth Required |
|--------|-------------------|------------------------------|---------------|
| POST   | `/api/auth/register` | Register a new user          | ❌ No |
| POST   | `/api/auth/login`    | Login and get JWT token      | ❌ No |
| GET    | `/api/auth/me`       | Get current user info        | ✅ Yes |

### Email Routes
| Method | Endpoint                   | Description                   | Auth Required |
|--------|---------------------------|-------------------------------|---------------|
| GET    | `/api/emails`              | Fetch all emails              | ✅ Yes |
| GET    | `/api/emails/:id`          | Fetch single email by ID      | ✅ Yes |
| POST   | `/api/emails`              | Save a new email              | ✅ Yes |
| POST   | `/api/emails/:id/reply`    | Send a reply to an email      | ✅ Yes |

---

---

## 🗄️ Database Schemas

### User Schema
```ts
{
  email: string,   // Unique user email
  password: string, // Hashed password
  name: string,     // Full name
  createdAt: Date,
  updatedAt: Date
}
```

### Email Schema
```ts
{
  from: string,      // Sender email
  to: string,        // Recipient email
  subject: string,   // Subject line
  body: string,      // Email content
  priority: string,  // spam | neutral | urgent
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🧪 Testing

Run unit tests with:
```bash
npm run test
```

---

## 🚀 Deployment

- Deployable on **Heroku, Render, or AWS**.
- Use **MongoDB Atlas** for cloud database.
- Use **Vercel/Netlify** for frontend separately.

---

## 👨‍💻 Author

**Your Name**  
🔗 GitHub: [sandeepsolai](https://github.com/sandeepsolai)  
📧 Email: sandeepsolai@gmail.com
