require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const certRoutes = require("./routes/certificates");
const studentRoutes = require("./routes/students");
const createAdmin = require("./utils/createAdmin");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();

app.use(express.json());
app.use(morgan("dev"));

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
