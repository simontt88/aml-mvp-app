# AML Screening System

A comprehensive AML (Anti-Money Laundering) screening system with Python FastAPI backend and React TypeScript frontend.

## Features

- **Authentication System**: JWT-based operator login/logout
- **Case Management**: Review AML screening cases with WorldCheck hits
- **AI Analysis**: Four aspect analysis (name, age, nationality, risk) with operator feedback
- **Citation System**: Click citations to highlight corresponding lines in structured records
- **Final Verdict**: Separate submission for case decisions (false positive/true match)
- **Audit Trail**: Track all operator actions for compliance
- **Responsive UI**: Modern interface built with React and Tailwind CSS

## Project Structure

```
aml-agent-fe/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── models.py       # SQLAlchemy database models
│   │   ├── schemas.py      # Pydantic schemas
│   │   ├── auth.py         # Authentication logic
│   │   ├── main.py         # FastAPI application
│   │   └── database.py     # Database configuration
│   ├── scripts/
│   │   └── migrate_csv.py  # CSV data migration script
│   └── requirements.txt    # Python dependencies
├── frontend/               # React TypeScript frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   ├── services/       # API services
│   │   └── types/          # TypeScript types
│   └── package.json        # Node.js dependencies
└── llm_data.csv           # Source data file
```

## Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js 16+
- PostgreSQL 12+

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Create database:**
   ```sql
   CREATE DATABASE aml_screening;
   ```

4. **Migrate CSV data:**
   ```bash
   cd scripts
   python migrate_csv.py ../llm_data.csv
   ```

5. **Start the server:**
   ```bash
   cd backend
   uvicorn app.main:app --reload --port 8000
   ```

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Usage

### Login
Use the default credentials created during migration:
- Email: `operator@example.com`
- Password: `password123`

### Case Review Workflow

1. **Dashboard**: View all cases with search and filtering
2. **Case Review**: Click "Review" to analyze a specific case
3. **Aspect Feedback**: 
   - Review AI analysis for each aspect (name, age, nationality, risk)
   - Provide feedback: Agree/Disagree/Not Related
   - Add comments for detailed explanations
4. **Citation Highlighting**: Click citation links to highlight source lines
5. **Final Verdict**: Submit final decision (False Positive/True Match)

### Key Features

- **Separate Feedback Systems**: Aspect feedback is independent of final case verdict
- **Citation System**: Real-time highlighting of structured record lines
- **Audit Trail**: All actions are logged for compliance
- **Status Management**: Cases progress through draft → in_review → submitted → closed
- **Role-Based Access**: Support for analyst, senior_analyst, supervisor roles

## Database Schema

The system uses the following main tables:
- `profiles`: Customer profile information
- `worldcheck_hits`: WorldCheck screening results
- `operators`: System users/operators
- `case_reviews`: Case review instances
- `aspect_feedback`: Operator feedback on AI analysis
- `audit_logs`: Audit trail for compliance

## API Endpoints

### Authentication
- `POST /auth/login` - Operator login
- `POST /auth/register` - Register new operator
- `GET /auth/me` - Get current operator info

### Profiles & Cases
- `GET /api/profiles` - List profiles with pagination/search
- `GET /api/profiles/{profile_id}` - Get case details
- `POST /api/cases` - Create case review
- `PUT /api/cases/{case_id}` - Update case review

### Feedback
- `POST /api/feedback` - Submit aspect feedback

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: ORM for database operations
- **PostgreSQL**: Primary database
- **JWT**: Authentication tokens
- **Pydantic**: Data validation and serialization

### Frontend
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **React Router**: Client-side routing
- **Axios**: HTTP client
- **Lucide React**: Icons

## Development

### Adding New Features

1. **Backend**: Update models in `models.py`, add schemas in `schemas.py`, implement endpoints in `main.py`
2. **Frontend**: Add types in `types/`, create components in `components/`, implement pages in `pages/`

### Testing

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm run test
```

### Building for Production

```bash
# Frontend
cd frontend
npm run build

# Backend (use production WSGI server)
pip install gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## Security Considerations

- JWT tokens with configurable expiration
- Password hashing with bcrypt
- SQL injection protection via SQLAlchemy
- CORS configuration for frontend access
- Input validation with Pydantic schemas

## Future Enhancements

- Real-time notifications with WebSocket
- Advanced search with Elasticsearch
- Document export (PDF reports)
- Batch case processing
- Dashboard analytics
- Mobile responsive optimizations