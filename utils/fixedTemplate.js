const path = require("path");

// Coordinates tuned for A4-like template; adjust if needed
// Coordinates are from bottom-left origin (pdf-lib default)
module.exports = {
  templatePath: path.join(__dirname, "..", "server", "templates", "certificate-template.pdf"),
  fontPath: process.env.ARABIC_FONT_PATH || path.join(__dirname, "..", "server", "fonts", "TraditionalArabic.ttf"),
  coords: {
    traineeName: { x: 420, y: 420, size: 22, align: "center" },
    courseName: { x: 420, y: 380, size: 18, align: "center" },
    trainerName: { x: 420, y: 340, size: 18, align: "center" },
    certificateNumber: { x: 160, y: 120, size: 12, align: "left" },
    issueDate: { x: 680, y: 120, size: 12, align: "right" },
  },
};


