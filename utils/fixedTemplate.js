const path = require("path");

// Coordinates tuned for A4-like template; adjust if needed
// Coordinates are from bottom-left origin (pdf-lib default)
module.exports = {
  templatePath: path.join(__dirname, "..", "server", "templates", "certificate-template.pdf"),
  fontPath: process.env.ARABIC_FONT_PATH || path.join(__dirname, "..", "server", "fonts", "TraditionalArabic.ttf"),
  coords: {
    traineeName: { x: 1000, y: 840, size: 43, align: "center", },
    courseName: { x: 1000, y: 670, size: 39, align: "center" },
    trainerName: { x: 1020, y: 360, size: 30, align: "center" },
    certificateNumber: { x: 1030, y: 180, size: 30, align: "center" },
    issueDate: { x: 1610, y: 183, size: 30, align: "center" },
  },
};

