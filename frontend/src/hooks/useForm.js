/**
 * Form Hook with React Hook Form + Zod - Phase 6.11
 * 
 * Purpose: Form validation and management
 */

import { useForm as useReactHookForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Common validation schemas
export const schemas = {
  email: z.string().email('Invalid email address'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
  
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be less than 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name must contain only letters'),
  
  address: z
    .string()
    .min(10, 'Address must be at least 10 characters')
    .max(200, 'Address must be less than 200 characters'),
  
  pincode: z
    .string()
    .regex(/^\d{6}$/, 'Invalid pincode'),
  
  price: z
    .number()
    .min(0, 'Price must be positive')
    .max(100000, 'Price must be less than 1,00,000'),
  
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(50, 'Quantity must be less than 50'),
};

// Login form schema
export const loginSchema = z.object({
  email: schemas.email,
  password: z.string().min(1, 'Password is required'),
});

// Signup form schema
export const signupSchema = z.object({
  name: schemas.name,
  email: schemas.email,
  password: schemas.password,
  confirmPassword: z.string(),
  phone: schemas.phone,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Address form schema
export const addressSchema = z.object({
  name: schemas.name,
  phone: schemas.phone,
  address: schemas.address,
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: schemas.pincode,
  landmark: z.string().optional(),
});

// Menu item form schema
export const menuItemSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: schemas.price,
  category: z.string().min(1, 'Category is required'),
  isAvailable: z.boolean(),
  isVeg: z.boolean(),
  image: z.string().url('Invalid image URL').optional(),
});

// Order form schema
export const orderSchema = z.object({
  deliveryAddress: addressSchema,
  paymentMethod: z.enum(['online', 'cod']),
  specialInstructions: z.string().max(200).optional(),
});

// Contact form schema
export const contactSchema = z.object({
  name: schemas.name,
  email: schemas.email,
  phone: schemas.phone,
  subject: z.string().min(5, 'Subject is required'),
  message: z.string().min(20, 'Message must be at least 20 characters'),
});

// Custom hook for forms
export const useForm = (schema, defaultValues = {}) => {
  const form = useReactHookForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
  });

  return {
    ...form,
    isValid: form.formState.isValid,
    isDirty: form.formState.isDirty,
    isSubmitting: form.formState.isSubmitting,
    errors: form.formState.errors,
  };
};

// Form field component
export const FormField = ({
  label,
  name,
  type = 'text',
  register,
  errors,
  placeholder,
  required = false,
  ...props
}) => {
  const error = errors[name];

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        id={name}
        type={type}
        {...register(name)}
        placeholder={placeholder}
        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        {...props}
      />
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      )}
    </div>
  );
};

// Textarea field component
export const TextareaField = ({
  label,
  name,
  register,
  errors,
  placeholder,
  required = false,
  rows = 4,
  ...props
}) => {
  const error = errors[name];

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <textarea
        id={name}
        {...register(name)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        {...props}
      />
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      )}
    </div>
  );
};

// Select field component
export const SelectField = ({
  label,
  name,
  register,
  errors,
  options,
  required = false,
  ...props
}) => {
  const error = errors[name];

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <select
        id={name}
        {...register(name)}
        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        {...props}
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      )}
    </div>
  );
};

// Checkbox field component
export const CheckboxField = ({
  label,
  name,
  register,
  errors,
  ...props
}) => {
  const error = errors[name];

  return (
    <div className="mb-4">
      <label className="flex items-center">
        <input
          type="checkbox"
          {...register(name)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          {...props}
        />
        <span className="ml-2 text-sm text-gray-700">{label}</span>
      </label>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      )}
    </div>
  );
};

export default useForm;
