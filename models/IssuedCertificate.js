import mongoose from "mongoose";

const IssuedCertificateSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template", required: true },
    traineeData: { type: Object, required: true },
    pdfUrl: { type: String, required: true },
    filePath: { type: String, required: true },
    certificateNumber: { type: String, required: true, unique: true },
    verificationUrl: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const IssuedCertificate = mongoose.model(
  "IssuedCertificate",
  IssuedCertificateSchema
);

export default IssuedCertificate;
