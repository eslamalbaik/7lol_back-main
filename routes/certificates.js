const express = require("express");
const router = express.Router();
const Certificate = require("../models/Certificate");
const multer = require("multer");
const auth = require("../middlewares/auth");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { customAlphabet } = require("nanoid");
const { shapeArabic } = require("../utils/arabicText");
const fixedTemplate = require("../utils/fixedTemplate");
const { validationResult, body } = require("express-validator");
const {
  uploadToS3,
  deleteFromS3,
  isS3Configured,
  getPresignedUrl,
} = require("../utils/s3Upload");
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
const PRESIGNED_URL_TTL = Number(process.env.S3_URL_EXPIRES_IN || 600);

async function getDownloadUrlForCert(cert) {
  if (!cert) return null;
  if (isS3Configured() && cert.s3Key) {
    try {
      return await getPresignedUrl(cert.s3Key, PRESIGNED_URL_TTL);
    } catch (err) {
      console.error("Failed to generate presigned URL:", err);
    }
  }
  return cert.pdfUrl || cert.certificateUrl;
}

async function serializeCertificate(cert) {
  if (!cert) return null;
  const data =
    typeof cert.toObject === "function" ? cert.toObject() : { ...cert };
  data.pdfUrl = await getDownloadUrlForCert(cert);
  return data;
}

async function serializeCertificates(list) {
  return Promise.all(list.map((cert) => serializeCertificate(cert)));
}

const LOCAL_CERTS_DIR = path.join(__dirname, "..", "public", "certificates");

function ensureLocalDir(targetPath = LOCAL_CERTS_DIR) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function buildLocalUrl(req, fileName) {
  return `${req.protocol}://${req.get("host")}/certificates/${fileName}`;
}

function resolveLocalPathFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const relative = parsed.pathname.replace(/^\/+/, "");
    if (!relative.startsWith("certificates/")) return null;
    return path.join(__dirname, "..", "public", relative);
  } catch {
    const relative = url.replace(/^\/+/, "");
    if (!relative.startsWith("certificates/")) return null;
    return path.join(__dirname, "..", "public", relative);
  }
}

async function removeCertificateAssets(cert) {
  if (!cert) return;

  if (isS3Configured() && cert.s3Key) {
    try {
      await deleteFromS3(cert.s3Key);
    } catch (err) {
      console.error("Failed to delete from S3:", err);
    }
  }

  const urls = new Set([cert.pdfUrl, cert.certificateUrl].filter(Boolean));

  for (const url of urls) {
    const localPath = resolveLocalPathFromUrl(url);
    if (!localPath) continue;
    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (err) {
      console.error("Failed to delete local file:", err);
    }
  }
}

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
    const data = await serializeCertificates(certs);

    res.json({
      data,
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
      const fontCandidates = [
        process.env.ARABIC_FONT_PATH &&
          path.resolve(process.env.ARABIC_FONT_PATH.trim()),
        fixedTemplate.fontPath &&
          path.resolve(
            fixedTemplate.fontPath.startsWith(".")
              ? path.join(__dirname, "..", fixedTemplate.fontPath)
              : fixedTemplate.fontPath
          ),
        path.join(__dirname, "..", "server", "fonts", "TraditionalArabic.ttf"),
      ].filter(Boolean);

      const fontPath =
        fontCandidates.find((candidate) => {
          try {
            return fs.existsSync(candidate);
          } catch {
            return false;
          }
        }) || null;

      if (!fontPath)
        return res.status(500).json({
          message:
            "لم يتم العثور على الخط العربي. يرجى ضبط ARABIC_FONT_PATH أو وضع TraditionalArabic.ttf",
          tried: fontCandidates,
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
        (certificateNumberInput && String(certificateNumberInput)) ||
        customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 12)();

      const issueDate = issueDateInput ? new Date(issueDateInput) : new Date();
      const formattedDate =
        !issueDateInput || !Number.isNaN(issueDate.getTime())
          ? issueDate.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : String(issueDateInput);
      drawRtL(generatedNumber, coords.certificateNumber.x, coords.certificateNumber.y, coords.certificateNumber.size, coords.certificateNumber.align);
      drawRtL(formattedDate, coords.issueDate.x, coords.issueDate.y, coords.issueDate.size, coords.issueDate.align);

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      const buffer = Buffer.from(pdfBytes);
      const fileName = `${generatedNumber}.pdf`;
      const key = `certificates/${fileName}`;

      let pdfUrl;
      let s3Key = null;
      if (isS3Configured()) {
        const result = await uploadToS3(buffer, key, "application/pdf");
        pdfUrl = result.url;
        s3Key = result.key;
      } else {
        const certsDir = LOCAL_CERTS_DIR;
        ensureLocalDir(certsDir);
        const filePath = path.join(certsDir, fileName);
        fs.writeFileSync(filePath, buffer);
        pdfUrl = buildLocalUrl(req, fileName);
      }

      const verificationUrl = `https://desn.pro/verify?certificate=${generatedNumber}`;

      // Persist certificate so it appears in GET /api/certificates
      const savedCert = await Certificate.create({
        studentName: traineeName,
        courseName,
        trainerName,
        certificateNumber: generatedNumber,
        pdfUrl,
        s3Key,
        certificateUrl: pdfUrl,
        verificationUrl,
      });

      const downloadUrl = await getDownloadUrlForCert(savedCert);

      return res.status(201).json({
        message: "تم إنشاء الشهادة بنجاح",
        pdfUrl: downloadUrl,
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
    drawText(studentName, 200, height - 260, 22);
    drawText(courseName, 200, height - 300, 18);
    drawText(trainerName, 200, height - 340, 18);
    drawText(new Date().toLocaleDateString("en-GB"), 200, height - 380, 14);
    drawText(certificateNumber, 200, height - 420, 14);
    drawText(verificationUrl, 200, height - 460, 12);

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const fileName = `${certificateNumber}.pdf`;
    const key = `certificates/${fileName}`;

    let pdfUrl;
    let s3Key = null;
    if (isS3Configured()) {
      const result = await uploadToS3(buffer, key, "application/pdf");
      pdfUrl = result.url;
      s3Key = result.key;
    } else {
      const filePath = path.join(LOCAL_CERTS_DIR, fileName);
      ensureLocalDir(path.dirname(filePath));
      fs.writeFileSync(filePath, buffer);
      pdfUrl = buildLocalUrl(req, fileName);
    }

    const record = await Certificate.create({
      studentName,
      courseName,
      trainerName,
      certificateNumber,
      pdfUrl,
      s3Key,
      certificateUrl: pdfUrl,
      verificationUrl,
    });

    const serialized = await serializeCertificate(record);

    return res.status(201).json({
      message: "Certificate generated",
      certificate: serialized,
      downloadUrl: serialized.pdfUrl,
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
      const ext = path.extname(file.originalname) || ".pdf";
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const key = `certificates/${uniqueName}`;

      let pdfUrl;
      let s3Key = null;
      if (isS3Configured()) {
        const result = await uploadToS3(
          file.buffer,
          key,
          file.mimetype || "application/pdf"
        );
        pdfUrl = result.url;
        s3Key = result.key;
      } else {
        const filePath = path.join(LOCAL_CERTS_DIR, uniqueName);
        ensureLocalDir(path.dirname(filePath));
        fs.writeFileSync(filePath, file.buffer);
        pdfUrl = buildLocalUrl(req, uniqueName);
      }

      const cert = await Certificate.create({
        studentId,
        pdfUrl,
        s3Key,
        certificateUrl: pdfUrl,
      });
      createdCerts.push(cert);
    }

    const response = await serializeCertificates(createdCerts);
    res.json(response);
  } catch (err) {
    console.error("Batch upload error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/certificates/
 * (admin only) Delete ALL certificates and their stored files
 */
router.delete("/", auth, async (req, res) => {
  try {
    const allCertificates = await Certificate.find({});
    const summary = {
      s3: { attempted: 0, successful: 0, failed: 0, errors: [] },
      local: { attempted: 0, successful: 0, failed: 0, errors: [] },
    };

    for (const cert of allCertificates) {
      if (isS3Configured() && cert.s3Key) {
        summary.s3.attempted++;
        try {
          await deleteFromS3(cert.s3Key);
          summary.s3.successful++;
        } catch (err) {
          summary.s3.failed++;
          summary.s3.errors.push({ key: cert.s3Key, error: err.message });
          console.error(`Failed to delete from S3: ${cert.s3Key}`, err);
        }
      }

      const urls = new Set([cert.pdfUrl, cert.certificateUrl].filter(Boolean));
      for (const url of urls) {
        const localPath = resolveLocalPathFromUrl(url);
        if (!localPath) continue;

        summary.local.attempted++;
        try {
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          summary.local.successful++;
        } catch (err) {
          summary.local.failed++;
          summary.local.errors.push({ path: localPath, error: err.message });
          console.error(`Failed to delete local file: ${localPath}`, err);
        }
      }
    }

    const mongoResult = await Certificate.deleteMany({});

    res.json({
      message: "Bulk deletion completed",
      storage: summary,
      mongoDB: { deletedCount: mongoResult.deletedCount },
    });
  } catch (err) {
    console.error("Bulk deletion error:", err);
    res.status(500).json({
      message: "Bulk deletion failed",
      error: err.message,
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
    const data = await serializeCertificates(certs);
    res.json(data);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET    /api/certificates/download/:id
 * (public) Redirect to the stored certificate URL
 */
router.get("/download/:id", async (req, res) => {
  try {
    const cert = await Certificate.findById(req.params.id);
    if (!cert)
      return res.status(404).json({ message: "Certificate not found" });
    const url = await getDownloadUrlForCert(cert);
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
    const serialized = await serializeCertificate(cert);
    return res.json({
      valid: true,
      certificate: serialized,
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
      await removeCertificateAssets(cert);

      const ext = path.extname(req.file.originalname) || ".pdf";
      const baseName = cert.certificateNumber
        ? `${cert.certificateNumber}${ext}`
        : `${cert._id}${ext}`;
      const key = `certificates/${baseName}`;

      let pdfUrl;
      let s3Key = null;
      if (isS3Configured()) {
        const result = await uploadToS3(
          req.file.buffer,
          key,
          req.file.mimetype || "application/pdf"
        );
        pdfUrl = result.url;
        s3Key = result.key;
      } else {
        const filePath = path.join(LOCAL_CERTS_DIR, baseName);
        ensureLocalDir(path.dirname(filePath));
        fs.writeFileSync(filePath, req.file.buffer);
        pdfUrl = buildLocalUrl(req, baseName);
      }

      cert.pdfUrl = pdfUrl;
      cert.certificateUrl = pdfUrl;
      cert.s3Key = s3Key;
    }

    // Update studentId if provided
    if (req.body.studentId) {
      cert.studentId = req.body.studentId;
    }

    await cert.save();
    const serialized = await serializeCertificate(cert);
    res.json(serialized);
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

    await removeCertificateAssets(cert);
    await Certificate.deleteOne({ _id: req.params.id });

    res.json({ message: "Certificate completely deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      message: "Deletion failed",
      error: err.message,
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
    const certificates = await Certificate.find({ studentId });
    for (const cert of certificates) {
      await removeCertificateAssets(cert);
    }
    const deleteResult = await Certificate.deleteMany({ studentId });

    return res.json({
      message: "تم حذف جميع الشهادات",
      deletedCertificates: deleteResult.deletedCount,
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
module.exports = router;