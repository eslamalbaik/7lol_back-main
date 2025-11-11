import mongoose from "mongoose";

const CertificateFieldSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template", required: true },
    fieldName: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    fontSize: { type: Number, default: 18 },
    fontFamily: { type: String, default: "TraditionalArabic" },
    align: { type: String, enum: ["left", "center", "right"], default: "right" },
    color: { type: String, default: "#000000" },
  },
  { timestamps: true }
);

const CertificateField = mongoose.model(
  "CertificateField",
  CertificateFieldSchema
);

export default CertificateField;
