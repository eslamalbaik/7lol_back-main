import mongoose from "mongoose";

const CertificateSchema = new mongoose.Schema(
  {
    // Legacy fields (for Cloudinary-based flows)
    studentId: { type: String, index: true },
    certificateUrl: { type: String },
    publicId: { type: String },

    // New fields for PDF generation/verification
    studentName: { type: String },
    courseName: { type: String },
    trainerName: { type: String },
    certificateNumber: { type: String, unique: true, index: true },
    pdfUrl: { type: String },
    verificationUrl: { type: String },
    s3Key: { type: String },
  },
  { timestamps: true }
);

const Certificate = mongoose.model("Certificate", CertificateSchema);

export default Certificate;
