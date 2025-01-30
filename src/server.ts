import express from "express";
import { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { Model, Recognizer } from "vosk";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Load Vosk models
const models: { [key: string]: string } = {
    "en": "./models/vosk-model-en-us-0.22",
    "de": "./models/vosk-model-de-0.6"
};

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

/**
 * Converts any non-WAV audio file to WAV (16kHz, mono) using FFmpeg
 */
const convertToWav = (inputPath: string, outputPath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const command = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}" -y`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error("FFmpeg Error:", stderr);
                return reject(error);
            }
            resolve(outputPath);
        });
    });
};

/**
 * API Endpoint: Transcribes uploaded audio (Supports MP3, WAV, OGG, FLAC)
 */
app.post("/api/speech-to-text", upload.single("audio"),async(req: Request, res: Response): Promise<any>=> {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    const { lang } = req.query;
    const modelPath = models[lang as string] || models["en"];
    const model = new Model(modelPath);

    // ✅ Fix: Correct instantiation of Recognizer
    const rec = new Recognizer({ model, sampleRate: 16000 });

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isWav = ext === ".wav";
    const convertedPath = isWav ? inputPath : `uploads/${Date.now()}.wav`;

    try {
        // Convert if not already WAV
        if (!isWav) await convertToWav(inputPath, convertedPath);

        const audioBuffer = fs.readFileSync(convertedPath);
        rec.acceptWaveform(audioBuffer);

        const rawResult = rec.result();
        const result = (typeof rawResult === "string") ? JSON.parse(rawResult).text : rawResult.text;

        fs.unlinkSync(inputPath);
        if (!isWav) fs.unlinkSync(convertedPath);

        return res.json({ transcript: result });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "Failed to process audio" });
    }
});

/**
 * API Endpoint: Transcribes a predefined test audio file
 * Supports MP3, WAV, OGG, FLAC (Auto-converts to WAV)
 */
app.get("/api/test-audio",async(req: Request, res: Response): Promise<any> => {
    const { lang } = req.query;
    const modelPath = models[lang as string] || models["en"];
    const model = new Model(modelPath);

    // ✅ Fix: Correct instantiation of Recognizer
    const rec = new Recognizer({ model, sampleRate: 16000 });

    let audioFilePath = "./testaudio.mp3";
    const ext = path.extname(audioFilePath).toLowerCase();
    const isWav = ext === ".wav";
    const convertedPath = isWav ? audioFilePath : `backend/test_converted.wav`;

    if (!fs.existsSync(audioFilePath)) {
        return res.status(404).json({ error: "Test audio file not found in backend folder" });
    }

    try {
        if (!isWav) await convertToWav(audioFilePath, convertedPath);

        const audioBuffer = fs.readFileSync(convertedPath);
        rec.acceptWaveform(audioBuffer);

        const rawResult = rec.result();
        const result = (typeof rawResult === "string") ? JSON.parse(rawResult).text : rawResult.text;

        if (!isWav) fs.unlinkSync(convertedPath);

        return res.json({ transcript: result });
    } catch (error) {
        console.error("Error processing test audio:", error);
        return res.status(500).json({ error: "Failed to process test audio" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
