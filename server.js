import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load env variables
dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ================= DB CONNECTION =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ================= SCHEMAS =================
const EventSchema = new mongoose.Schema({
  ts: String,
  type: String,
  details: Object,
});

const ReportSchema = new mongoose.Schema({
  candidateName: String,
  interviewStart: String,
  interviewEnd: String,
  interviewDurationMin: Number,
  lookAwayCount: Number,
  noFaceCount: Number,
  multipleFacesCount: Number,
  suspiciousObjects: Array,
  integrityScore: Number,
  events: [EventSchema],
  videoPath: String,
  pdfPath: String,
});

const Report = mongoose.model("Report", ReportSchema);

// ================= FILE STORAGE =================



const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = isProd ? "/tmp" : "uploads";

    if (!isProd && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // only try locally
    }

    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ================= ROUTES =================
app.post(
  "/upload",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.body.report) {
        return res.status(400).json({ error: "Missing report JSON" });
      }

      const parsedReport = JSON.parse(req.body.report);

      // Paths for uploaded files
      const videoPath = req.files["video"] ? req.files["video"][0].path : null;
      const pdfPath = req.files["pdf"] ? req.files["pdf"][0].path : null;

      const newReport = new Report({
        ...parsedReport,
        videoPath,
        pdfPath,
      });

      await newReport.save();

      res.json({ success: true, id: newReport._id });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);


// Get All Reports
app.get("/reports", async (req, res) => {
  const reports = await Report.find().sort({ _id: -1 });
  res.json(reports);
});

// Get Single Report
app.get("/reports/:id", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});
app.get("/reports/:id/video", async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report || !report.videoPath) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Directly stream the file instead of download
    res.sendFile(report.videoPath, (err) => {
      if (err) {
        console.error("Send video error:", err);
        res.status(500).json({ error: "Failed to send video" });
      }
    });
  } catch (err) {
    console.error("Download video error:", err);
    res.status(500).json({ error: "Failed to download video" });
  }
});

app.get("/reports/:id/pdf", async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report || !report.pdfPath) {
      return res.status(404).json({ error: "PDF not found" });
    }

    res.sendFile(report.pdfPath, (err) => {
      if (err) {
        console.error("Send PDF error:", err);
        res.status(500).json({ error: "Failed to send PDF" });
      }
    });
  } catch (err) {
    console.error("Download PDF error:", err);
    res.status(500).json({ error: "Failed to download PDF" });
  }
});

// Serve uploaded files
app.use("/uploads", express.static("uploads"));

// ================= START SERVER =================
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
