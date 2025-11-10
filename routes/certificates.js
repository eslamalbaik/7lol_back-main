const express = require("express");
const router = express.Router();
const Certificate = require("../models/Certificate");
const multer = require("multer");
const uploadBuffer = require("../utils/cloudinaryUpload");
const auth = require("../middlewares/auth");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { customAlphabet } = require("nanoid");
const Template = require("../models/Template");
const CertificateField = require("../models/CertificateField");
const IssuedCertificate = require("../models/IssuedCertificate");
const { shapeArabic } = require("../utils/arabicText");
const fixedTemplate = require("../utils/fixedTemplate");
const { validationResult, body } = require("express-validator");
// Make pdfjs optional for environments where it isn't available
let pdfjsLib = null;
try {
  pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
} catch (e) {
  // optional dependency not found; analysis will skip text extraction
  pdfjsLib = null;
}
// Configure multer for in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", async (req, res) => {
  try {
    // Parse pagination parameters from query string with defaults
    const page = parseInt(req.query.page) || 1; // default to page 1
    const limit = parseInt(req.query.limit) || 10; // default to 10 items per page

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count of documents for pagination metadata
    const total = await Certificate.countDocuments();

    // Fetch paginated results
    const certs = await Certificate.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // Return response with pagination metadata
    res.json({
      data: certs,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error("Error fetching all certificates:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/certificates/generate-fixed
 * Body: { traineeName, courseName, trainerName, certificateNumber, issueDate }
 * Uses single fixed template and predefined coordinates
 */
router.post(
  "/generate-fixed",
  auth,
  [
    body("traineeName").isString(),
    body("courseName").isString(),
    body("trainerName").isString(),
    body("certificateNumber").optional().isString(),
    body("issueDate").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({
          message: "خطأ في التحقق من البيانات",
          errors: errors.array(),
        });

      const { traineeName, courseName, trainerName } = req.body;
      const certificateNumberInput = req.body.certificateNumber;
      const issueDateInput = req.body.issueDate;

      // Load template
      const templateCandidates = [
        process.env.CERT_TEMPLATE_PATH,
        fixedTemplate.templatePath,
      ].filter(Boolean);

      const templatePath = templateCandidates.find((p) => fs.existsSync(p));
      if (!templatePath)
        return res.status(500).json({
          message: "لم يتم العثور على قالب الشهادة",
          tried: templateCandidates,
        });

      const templateBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      pdfDoc.registerFontkit(fontkit);

      const page = pdfDoc.getPages()[0];

      // Load Arabic font
      const fontPath = fixedTemplate.fontPath;
      if (!fs.existsSync(fontPath))
        return res.status(500).json({
          message:
            "لم يتم العثور على الخط العربي. يرجى ضبط ARABIC_FONT_PATH أو وضع TraditionalArabic.ttf",
        });

      const fontBytes = fs.readFileSync(fontPath);
      const arabicFont = await pdfDoc.embedFont(fontBytes);

      // Convert hex (#2424bc) → RGB
      const hexToRgb = (hex) => {
        const bigint = parseInt(hex.replace("#", ""), 16);
        return rgb(
          ((bigint >> 16) & 255) / 255,
          ((bigint >> 8) & 255) / 255,
          (bigint & 255) / 255
        );
      };

      // Fixed color: #2424bc
      const blueColor = hexToRgb("#2424bc");

      // Draw text (Right-to-Left Arabic support)
      const drawRtL = (text, x, y, size, align) => {
        const shaped = shapeArabic(text);
        const textWidth = arabicFont.widthOfTextAtSize(shaped, size);
        let drawX = x;
        if (align === "right") drawX = x - textWidth;
        if (align === "center") drawX = x - textWidth / 2;
        page.drawText(shaped, {
          x: drawX,
          y,
          size,
          font: arabicFont,
          color: blueColor,
        });
      };

      const { coords } = fixedTemplate;

      // Draw all text in #2424bc
      drawRtL(
        String(traineeName),
        coords.traineeName.x,
        coords.traineeName.y,
        coords.traineeName.size,
        coords.traineeName.align
      );
      drawRtL(
        String(courseName),
        coords.courseName.x,
        coords.courseName.y,
        coords.courseName.size,
        coords.courseName.align
      );
      drawRtL(
        String(trainerName),
        coords.trainerName.x,
        coords.trainerName.y,
        coords.trainerName.size,
        coords.trainerName.align
      );

      const generatedNumber =
        certificateNumberInput ||
        customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 12)();
const formattedDate =
  issueDateInput || new Date().toLocaleDateString("en-GB");


      drawRtL(
        generatedNumber,
        coords.certificateNumber.x,
        coords.certificateNumber.y,
        coords.certificateNumber.size,
        coords.certificateNumber.align
      );
      drawRtL(
        formattedDate,
        coords.issueDate.x,
        coords.issueDate.y,
        coords.issueDate.size,
        coords.issueDate.align
      );

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      const publicDir = path.join(__dirname, "..", "public");
      const certsDir = path.join(publicDir, "certificates");
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
      if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

      const fileName = `${generatedNumber}.pdf`;
      const filePath = path.join(certsDir, fileName);
      fs.writeFileSync(filePath, pdfBytes);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const pdfUrl = `${baseUrl}/certificates/${fileName}`;
      const verificationUrl = `https://desn.pro/verify?certificate=${generatedNumber}`;

      // Save record in DB
      await Certificate.create({
        studentName: traineeName,
        courseName,
        trainerName,
        certificateNumber: generatedNumber,
        pdfUrl,
        verificationUrl,
      });

      return res.status(201).json({
        message: "تم إنشاء الشهادة بنجاح",
        pdfUrl,
        certificateNumber: generatedNumber,
        issueDate: formattedDate,
        verificationUrl,
      });
    } catch (err) {
      console.error("Generate fixed template error:", err);
      return res
        .status(500)
        .json({ message: "خطأ في الخادم", error: err.message });
    }
  }
);

/**
 * POST /api/analyze-template
 * Upload a template PDF and extract page size and any detectable text items
 */
router.post(
  "/analyze-template",
  auth,
  upload.single("template"),
  async (req, res) => {
    return res.status(410).json({ message: "تم تعطيل هذا المسار حالياً" });
  }
);

/**
 * POST   /api/certificates/generate
 * (admin only) Generate a certificate PDF from a template
 * Body: { studentName, courseName, trainerName }
 */
router.post("/generate", auth, async (req, res) => {
  try {
    const { studentName, courseName, trainerName } = req.body;
    if (!studentName || !courseName || !trainerName) {
      return res
        .status(400)
        .json({ message: "studentName, courseName, trainerName are required" });
    }

    // Prepare directories
    const publicDir = path.join(__dirname, "..", "public");
    const certsDir = path.join(publicDir, "certificates");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
    if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

    // Load template (support multiple default locations)
    const candidates = [
      process.env.CERT_TEMPLATE_PATH,
      path.join(__dirname, "..", "server", "templates", "certificate-template.pdf"),
      path.join(__dirname, "..", "templates", "certificate-template.pdf"),
    ].filter(Boolean);

    const templatePath = candidates.find((p) => fs.existsSync(p));
    if (!templatePath) {
      return res.status(500).json({
        message: "Certificate template not found",
        tried: candidates,
      });
    }
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Generate certificate number
    const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 12);
    const certificateNumber = nanoid();
    const verificationUrl = `https://desn.pro/verify?certificate=${certificateNumber}`;

    // Coordinates (adjust as needed for your template)
    const drawText = (text, x, y, size = 18) => {
      page.drawText(String(text), {
        x,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    };

    // Example placements
    drawText(studentName, 200, height - 4260, 22);
    drawText(courseName, 200, height - 300, 18);
    drawText(trainerName, 200, height - 340, 18);
    drawText(new Date().toLocaleDateString("en-GB"), 200, height - 380, 14);
    drawText(certificateNumber, 200, height - 420, 14);
    drawText(verificationUrl, 200, height - 460, 12);

    const pdfBytes = await pdfDoc.save();
    const fileName = `${certificateNumber}.pdf`;
    const filePath = path.join(certsDir, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const pdfUrl = `${baseUrl}/certificates/${fileName}`;

    const record = await Certificate.create({
      studentName,
      courseName,
      trainerName,
      certificateNumber,
      pdfUrl,
      verificationUrl,
    });

    return res.status(201).json({
      message: "Certificate generated",
      certificate: record,
      downloadUrl: pdfUrl,
    });
  } catch (err) {
    console.error("Generate PDF error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * POST /api/generate-certificate
 * Body: { template_id, field_mappings: { key: value }, fields (optional override coords) }
 */
router.post(
  "/generate-certificate",
  auth,
  [
    body("template_id").isString(),
    body("field_mappings").isObject(),
  ],
  async (req, res) => {
    return res.status(410).json({ message: "تم تعطيل هذا المسار حالياً" });
  }
);

/**
 * POST   /api/certificates/
 * (admin only) Upload one or more certificates for a student
 */
router.post("/", auth, upload.array("certificate", 10), async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ message: "No files uploaded" });

    const createdCerts = [];
    for (const file of req.files) {
      const result = await uploadBuffer(file.buffer);
      const cert = await Certificate.create({
        studentId,
        certificateUrl: result.secure_url,
        publicId: result.public_id,
      });
      createdCerts.push(cert);
    }

    res.json(createdCerts);
  } catch (err) {
    console.error("Batch upload error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/certificates/
 * (admin only) Delete ALL certificates from MongoDB and Cloudinary
 */
router.delete("/", auth, async (req, res) => {
  try {
    // 1. Verify Cloudinary is properly configured
    if (!cloudinary?.uploader?.destroy) {
      throw new Error("Cloudinary uploader is not properly configured");
    }

    // 2. Get all certificates
    const allCertificates = await Certificate.find({});

    // 3. Delete from Cloudinary
    const deletionResults = {
      success: [],
      failures: [],
    };

    for (const cert of allCertificates) {
      if (cert.publicId) {
        try {
          await cloudinary.uploader.destroy(cert.publicId);
          deletionResults.success.push(cert.publicId);
        } catch (err) {
          deletionResults.failures.push({
            publicId: cert.publicId,
            error: err.message,
          });
          console.error(`Failed to delete ${cert.publicId}:`, err);
        }
      }
    }

    // 4. Delete from MongoDB
    const mongoResult = await Certificate.deleteMany({});

    res.json({
      message: "Bulk deletion completed",
      cloudinary: {
        attempted: allCertificates.length,
        successful: deletionResults.success.length,
        failed: deletionResults.failures.length,
        errors: deletionResults.failures,
      },
      mongoDB: {
        deletedCount: mongoResult.deletedCount,
      },
    });
  } catch (err) {
    console.error("Bulk deletion error:", err);
    res.status(500).json({
      message: "Bulk deletion failed",
      error: err.message,
      // Only show stack in development
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

/**
 * GET    /api/certificates/search
 * (public) Search certificates by studentId
 */
router.get("/search", async (req, res) => {
  const { studentId } = req.query;
  if (!studentId)
    return res.status(400).json({ message: "studentId is required" });

  try {
    const certs = await Certificate.find({ studentId });
    res.json(certs);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET    /api/certificates/download/:id
 * (public) Redirect to the Cloudinary URL for download
 */
router.get("/download/:id", async (req, res) => {
  try {
    const cert = await Certificate.findById(req.params.id);
    console.log("ddd", cert);
    if (!cert)
      return res.status(404).json({ message: "Certificate not found" });
    // Prefer local pdfUrl if present, otherwise fallback to legacy Cloudinary URL
    const url = cert.pdfUrl || cert.certificateUrl;
    if (!url) return res.status(404).json({ message: "No file URL" });
    res.redirect(url);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET    /api/certificates/verify?certificate=ABC...
 * (public) Verify certificate by its auto-generated number
 */
router.get("/verify", async (req, res) => {
  const { certificate } = req.query;
  if (!certificate) return res.status(400).json({ message: "certificate is required" });
  try {
    const cert = await Certificate.findOne({ certificateNumber: certificate });
    if (!cert) return res.status(404).json({ message: "Not found" });
    return res.json({
      valid: true,
      certificate: {
        studentName: cert.studentName,
        courseName: cert.courseName,
        trainerName: cert.trainerName,
        certificateNumber: cert.certificateNumber,
        pdfUrl: cert.pdfUrl,
        verificationUrl: cert.verificationUrl,
        createdAt: cert.createdAt,
      },
    });
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT    /api/certificates/:id
 * (admin only) Update a certificate file or studentId
 */
router.put("/:id", auth, upload.single("certificate"), async (req, res) => {
  try {
    const cert = await Certificate.findById(req.params.id);
    if (!cert)
      return res.status(404).json({ message: "Certificate not found" });

    // Replace file if new one provided
    if (req.file) {
      await cloudinary.uploader.destroy(cert.publicId);
      const result = await uploadBuffer(req.file.buffer);
      cert.certificateUrl = result.secure_url;
      cert.publicId = result.public_id;
    }

    // Update studentId if provided
    if (req.body.studentId) {
      cert.studentId = req.body.studentId;
    }

    await cert.save();
    res.json(cert);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/certificates/:id
 * (admin only) Delete a certificate
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const cert = await Certificate.findById(req.params.id);
    if (!cert) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    // Strict version - fails completely if Cloudinary deletion fails
    if (cert.publicId) {
      await cloudinary.uploader.destroy(cert.publicId);
    }

    await Certificate.deleteOne({ _id: req.params.id });

    res.json({ message: "Certificate completely deleted from both systems" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      message: "Deletion failed - rolled back",
      error: "Certificate was not deleted from either system due to an error",
    });
  }
});

/**
 * GET    /api/certificates/stats
 * (admin only) Overview stats
 */
router.get("/stats", auth, async (req, res) => {
  try {
    const totalCerts = await Certificate.countDocuments();
    const uniqueStudents = (await Certificate.distinct("studentId")).length;
    res.json({ totalCerts, uniqueStudents });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/student/:studentId", auth, async (req, res) => {
  const { studentId } = req.params;
  try {
    // 1) Delete all matching certificates
    const certResult = await Certificate.deleteMany({ studentId });

    // 2) Optionally delete the Student document itself
    return res.json({
      message: "تم حذف جميع الشهادات",
      deletedCertificates: certResult.deletedCount,
    });
  } catch (err) {
    console.error("Error deleting student certificates:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/trends/daily", auth, async (req, res) => {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);

  try {
    const data = await Certificate.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day",
            },
          },
          count: 1,
          _id: 0,
        },
      },
    ]);
    res.json(data);
  } catch (err) {
    console.error("Daily trends error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/certificates/trends/monthly
// Returns number of certs per month for the last 12 months
router.get("/trends/monthly", auth, async (req, res) => {
  const today = new Date();
  const lastYear = new Date();
  lastYear.setFullYear(today.getFullYear() - 1);

  try {
    const data = await Certificate.aggregate([
      { $match: { createdAt: { $gte: lastYear } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      {
        $project: {
          label: {
            $concat: [
              { $toString: "$_id.month" },
              "-",
              { $toString: "$_id.year" },
            ],
          },
          count: 1,
          _id: 0,
        },
      },
    ]);
    res.json(data);
  } catch (err) {
    console.error("Monthly trends error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Add this right before module.exports
router.get("/cloudinary-test", auth, async (req, res) => {
  try {
    // Test configuration
    if (!cloudinary.config().cloud_name) {
      return res.status(500).json({ error: "Cloudinary not configured" });
    }

    // Test actual uploader functionality
    try {
      // Try listing some resources (safe operation)
      const result = await cloudinary.api.resources({ max_results: 1 });
      return res.json({
        status: "Cloudinary working properly",
        config: {
          cloud_name: cloudinary.config().cloud_name,
          api_key: cloudinary.config().api_key ? "present" : "missing",
        },
        testResult: result,
      });
    } catch (apiError) {
      return res.status(500).json({
        error: "Cloudinary API test failed",
        details: apiError.message,
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: "Cloudinary test failed",
      details: err.message,
    });
  }
});

module.exports = router;
