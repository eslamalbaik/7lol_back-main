import dotenv from "dotenv";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config();

const region = process.env.AWS_REGION || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_S3_BUCKET_NAME;

function isS3Configured() {
  return Boolean(accessKeyId && secretAccessKey && bucket && region);
}

let s3Client;
if (isS3Configured()) {
  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint: region === "us-east-1" ? undefined : `https://s3.${region}.amazonaws.com`,
    forcePathStyle: false,
  });
}

function getKeyFromInput(keyOrUrl) {
  if (!keyOrUrl) return null;
  if (keyOrUrl.includes("amazonaws.com/")) {
    return keyOrUrl.split("amazonaws.com/")[1];
  }
  return keyOrUrl.replace(/^\/+/, "");
}

async function uploadToS3(buffer, key, contentType = "application/pdf") {
  if (!isS3Configured()) {
    throw new Error("AWS S3 is not configured");
  }

  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(putCommand);
  return {
    url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
    key,
  };
}

async function deleteFromS3(keyOrUrl) {
  if (!isS3Configured()) {
    throw new Error("AWS S3 is not configured");
  }

  const key = getKeyFromInput(keyOrUrl);
  if (!key) return;

  const deleteCommand = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(deleteCommand);
}

async function getPresignedUrl(keyOrUrl, expiresIn = 3600) {
  if (!isS3Configured()) {
    throw new Error("AWS S3 is not configured");
  }

  const key = getKeyFromInput(keyOrUrl);
  if (!key) {
    throw new Error("Invalid S3 key or URL");
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export { isS3Configured, uploadToS3, deleteFromS3, getPresignedUrl };

