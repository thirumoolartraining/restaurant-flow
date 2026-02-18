/**
 * Loading State Components - Phase 6.11
 * 
 * Purpose: Standardized loading states
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

// Full page loading
export const PageLoader = ({ message = 'Loading...' }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
      <p className="text-gray-600">{message}</p>
    </div>
  </div>
);

// Inline loading
export const InlineLoader = ({ size = 'md', message }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <Loader2 className={`${sizeClasses[size]} text-blue-600 animate-spin`} />
      {message && <span className="text-gray-600">{message}</span>}
    </div>
  );
};

// Button loading
export const ButtonLoader = ({ loading, children, ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className={`${props.className} ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
  >
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </span>
    ) : (
      children
    )}
  </button>
);

// Skeleton loader
export const Skeleton = ({ className = '', variant = 'text' }) => {
  const variants = {
    text: 'h-4 w-full',
    title: 'h-8 w-3/4',
    avatar: 'h-12 w-12 rounded-full',
    card: 'h-48 w-full',
    button: 'h-10 w-24',
  };

  return (
    <div
      className={`${variants[variant]} ${className} bg-gray-200 animate-pulse rounded`}
    />
  );
};

// Card skeleton
export const CardSkeleton = () => (
  <div className="bg-white rounded-lg shadow p-4 space-y-4">
    <Skeleton variant="avatar" />
    <Skeleton variant="title" />
    <Skeleton variant="text" />
    <Skeleton variant="text" className="w-2/3" />
    <Skeleton variant="button" />
  </div>
);

// Table skeleton
export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4">
        {Array.from({ length: columns }).map((_, j) => (
          <Skeleton key={j} className="flex-1" />
        ))}
      </div>
    ))}
  </div>
);

// Spinner
export const Spinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <Loader2 className={`${sizeClasses[size]} ${className} animate-spin`} />
  );
};

// Loading overlay
export const LoadingOverlay = ({ show, message = 'Loading...' }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-700">{message}</p>
      </div>
    </div>
  );
};

export default {
  PageLoader,
  InlineLoader,
  ButtonLoader,
  Skeleton,
  CardSkeleton,
  TableSkeleton,
  Spinner,
  LoadingOverlay,
};
