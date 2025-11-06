const mongoose = require("mongoose");

const TemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    filePath: { type: String, required: true },
    pageWidth: { type: Number, required: true },
    pageHeight: { type: Number, required: true },
    analysis: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Template", TemplateSchema);


