// utils/cloudinaryUpload.js
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");

function uploadBuffer(buffer, folder = "certificates") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

module.exports = uploadBuffer;
