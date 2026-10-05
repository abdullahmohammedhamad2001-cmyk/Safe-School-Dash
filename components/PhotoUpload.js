"use client";

import React, { useRef, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { supabase, fileExt, imageError } from "../supabaseClient";
import { useGlobalState } from "../globalState";

// Shows a person's photo with a button to upload a new one. Files are named <school id>/<record id>.<ext>
const PhotoUpload = ({ bucket, table, schoolId, recordId, photoPath, photoUrl, fallback }) => {
    const { refresh } = useGlobalState();
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";

        if (!file) return;

        const invalid = imageError(file);
        if (invalid) {
            alert(invalid);
            return;
        }

        const path = `${schoolId}/${recordId}.${fileExt(file)}`;
        const storage = supabase.storage.from(bucket);

        try {
            setUploading(true);

            const { error: uploadError } = await storage.upload(path, file, {
                contentType: file.type,
                upsert: true,
            });
            if (uploadError) throw uploadError;

            const { error } = await supabase.from(table).update({ photo_path: path }).eq("id", recordId);
            if (error) throw error;

            if (photoPath && photoPath !== path) await storage.remove([photoPath]);

            await refresh();
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء رفع الصورة");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={photoUrl}
                    alt=""
                    style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
                />
            ) : (
                fallback
            )}

            <div
                className="create-btn"
                style={{ height: 25 }}
                onClick={() => !uploading && inputRef.current?.click()}
            >
                {uploading ? (
                    <ClipLoader size={12} color="#fff" />
                ) : (
                    <p>{photoUrl ? "تغيير الصورة" : "رفع صورة"}</p>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFile}
            />
        </div>
    );
};

export default PhotoUpload;
