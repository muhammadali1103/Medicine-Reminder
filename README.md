# Smart Medicine Reminder with MySQL

This project now uses:

- React + Vite for the frontend
- Express for the local API
- MySQL for the database

## Local setup

1. Install dependencies:

```sh
npm install
```

2. Make sure MySQL is running locally.

3. Update `.env` if your MySQL username, password, port, or database name are different.

4. Create the database tables:

```sh
npm run db:init
```

5. Start frontend and backend together:

```sh
npm run dev:full
```

6. Open the app:

```txt
http://localhost:5173
```

## Useful scripts

```sh
npm run dev
npm run server:dev
npm run dev:full
npm run db:init
npm run build
```

## Notes

- The old cloud database client has been replaced by the local API wrapper in `src/lib/apiClient.ts`.
- Main auth, profile, medications, dose logs, reports, and caregiver tables now run through MySQL.
- AI/SMS helper features are stubbed for local mode unless you add your own implementations in `server/index.js`.
