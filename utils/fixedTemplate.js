const path = require("path");

// Coordinates tuned for A4-like template; adjust if needed
// Coordinates are from bottom-left origin (pdf-lib default)
module.exports = {
  templatePath: path.join(__dirname, "..", "server", "templates", "certificate-template.pdf"),
  fontPath: process.env.ARABIC_FONT_PATH || path.join(__dirname, "..", "server", "fonts", "TraditionalArabic.ttf"),
  coords: {
<<<<<<< HEAD
    traineeName: { x: 1010, y: 830, size: 43, align: "center", },
    courseName: { x: 1000, y: 700, size: 39, align: "center" },
    trainerName: { x: 1020, y: 370, size: 30, align: "center" },
=======
    traineeName: { x: 1000, y: 840, size: 43, align: "center", },
    courseName: { x: 1000, y: 670, size: 39, align: "center" },
    trainerName: { x: 1020, y: 360, size: 30, align: "center" },
>>>>>>> 12139d3b78a5a5205a32a3197577295d1de03ecd
    certificateNumber: { x: 1030, y: 180, size: 30, align: "center" },
    issueDate: { x: 1610, y: 183, size: 30, align: "center" },
  },
};

