import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import certRoutes from "./routes/certificates.js";
import studentRoutes from "./routes/students.js";
import createAdmin from "./utils/createAdmin.js";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

// CORS configuration for frontend at http://localhost:5173 with credentials support
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());

// Serve generated certificates
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/certificates",
  express.static(path.join(__dirname, "public", "certificates"))
);
app.use(
  "/templates",
  express.static(path.join(__dirname, "public", "templates"))
);
// Serve template files directly from server/templates for tooling like coord-picker
app.use(
  "/server/templates",
  express.static(path.join(__dirname, "server", "templates"))
);

// Swagger
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "Certificate API", version: "1.0.0" },
  },
  apis: [],
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/", (req, res) => res.json({ message: "API running" }));

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/certificates", certRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  await createAdmin();
  app.listen(process.env.PORT || 5000, () => console.log("Server listening"));
}
start();
