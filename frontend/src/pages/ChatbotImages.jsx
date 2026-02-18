import { useState, useEffect, useRef } from 'react';
import { Upload, RefreshCw, Image as ImageIcon, Check, X, Loader2 } from 'lucide-react';
import api from '../api';

export default function ChatbotImages() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRefs = useRef({});

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      setLoading(true);
      const res = await api.get('/chatbot-images');
      setImages(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (key, file) => {
    if (!file) return;
    
    setUploading(key);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const res = await api.put(`/chatbot-images/${key}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImages(prev => prev.map(img => 
        img.key === key ? res.data : img
      ));
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleReset = async (key) => {
    if (!confirm('Reset this image to default?')) return;
    
    setUploading(key);
    setError(null);
    
    try {
      const res = await api.post(`/chatbot-images/${key}/reset`);
      setImages(prev => prev.map(img => 
        img.key === key ? res.data : img
      ));
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed');
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Chatbot Images</h1>
          <p className="text-dark-500 mt-1">Manage WhatsApp bot message images (2:1 landscape format)</p>
        </div>
        <button
          onClick={fetchImages}
          className="flex items-center gap-2 px-4 py-2 bg-dark-100 hover:bg-dark-200 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <X className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Images Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {images.map(image => (
          <div key={image.key} className="bg-white rounded-2xl shadow-card overflow-hidden">
            {/* Image Preview - 2:1 aspect ratio */}
            <div className="relative aspect-[2/1] bg-dark-100">
              <img
                src={image.imageUrl}
                alt={image.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/1200x600?text=Image+Not+Found';
                }}
              />
              {uploading === image.key && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
              {image.cloudinaryPublicId && (
                <div className="absolute top-3 right-3 bg-green-500 text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Custom
                </div>
              )}
            </div>

            {/* Image Info */}
            <div className="p-4">
              <h3 className="font-semibold text-dark-900">{image.name}</h3>
              <p className="text-sm text-dark-500 mt-1">{image.description}</p>
              <p className="text-xs text-dark-400 mt-2">Key: {image.key}</p>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={el => fileInputRefs.current[image.key] = el}
                  onChange={(e) => handleUpload(image.key, e.target.files[0])}
                />
                <button
                  onClick={() => fileInputRefs.current[image.key]?.click()}
                  disabled={uploading === image.key}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  Upload New
                </button>
                {image.cloudinaryPublicId && (
                  <button
                    onClick={() => handleReset(image.key)}
                    disabled={uploading === image.key}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-100 hover:bg-dark-200 text-dark-700 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <ImageIcon className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Image Guidelines</h4>
            <ul className="text-sm text-blue-700 mt-2 space-y-1">
              <li>• Recommended size: 1200 x 600 pixels (2:1 aspect ratio)</li>
              <li>• Images are automatically cropped to 2:1 landscape format</li>
              <li>• Supported formats: JPG, PNG, WebP</li>
              <li>• Max file size: 10MB</li>
              <li>• Images are optimized via Cloudinary for fast delivery</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
