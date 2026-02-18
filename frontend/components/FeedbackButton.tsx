'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, X, Send, Star } from 'lucide-react';
import { submitFeedback, FeedbackSubmission } from '../lib/api';

interface FeedbackButtonProps {
  generationId: string; // UUID
  modelUsed?: string;
  tokensUsed?: number;
  latencyMs?: number;
  className?: string;
}

export default function FeedbackButton({
  generationId,
  modelUsed,
  tokensUsed,
  latencyMs,
  className = ''
}: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<boolean | null>(null);
  const [ratingScore, setRatingScore] = useState<number>(0);
  const [reasonCategory, setReasonCategory] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonCategories = [
    { value: 'unclear', label: 'Unclear' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'incorrect', label: 'Incorrect' },
    { value: 'repetitive', label: 'Repetitive' },
    { value: 'too_long', label: 'Too Long' },
    { value: 'too_short', label: 'Too Short' },
    { value: 'irrelevant', label: 'Irrelevant' },
  ];

  const handleSubmit = async () => {
    if (rating === null) {
      setError('Please select a thumbs up or down');
      return;
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!generationId || !uuidRegex.test(generationId)) {
      setError('Invalid generation ID. Please generate content first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const data: FeedbackSubmission = {
        generationId,
        rating,
        ratingScore: ratingScore > 0 ? ratingScore : undefined,
        reasonCategory: rating === false ? reasonCategory : undefined,
        reasonDetails: rating === false && reasonDetails ? reasonDetails : undefined,
        modelUsed,
        tokensUsed,
        latencyMs,
      };

      await submitFeedback(data);
      setSubmitted(true);
      
      // Close modal after brief delay
      setTimeout(() => {
        setIsOpen(false);
        // Reset state after closing
        setTimeout(() => {
          setRating(null);
          setRatingScore(0);
          setReasonCategory('');
          setReasonDetails('');
          setSubmitted(false);
        }, 300);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    // Check if generationId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidId = generationId && uuidRegex.test(generationId);
    
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm text-gray-500 dark:text-gray-400">Was this helpful?</span>
        <button
          onClick={() => setIsOpen(true)}
          disabled={!isValidId}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            isValidId 
              ? 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700' 
              : 'text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-900 cursor-not-allowed'
          }`}
        >
          <ThumbsUp size={16} />
          <span>Feedback</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-900">
          <h3 className="font-semibold text-gray-900 dark:text-white">Share Your Feedback</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {submitted ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="text-green-600 dark:text-green-400" size={24} />
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-white">Thank you!</p>
              <p className="text-gray-600 dark:text-gray-400">Your feedback helps us improve.</p>
            </div>
          ) : (
            <>
              {/* Rating Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  How would you rate this output?
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setRating(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                      rating === true
                        ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <ThumbsUp size={20} className={rating === true ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'} />
                    <span>Good</span>
                  </button>
                  <button
                    onClick={() => setRating(false)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                      rating === false
                        ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <ThumbsDown size={20} className={rating === false ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'} />
                    <span>Needs Improvement</span>
                  </button>
                </div>
              </div>

              {/* Star Rating (Optional) */}
              {rating !== null && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Rate quality (optional)
                  </label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRatingScore(star)}
                        className="p-1"
                      >
                        <Star
                          size={24}
                          className={
                            star <= ratingScore
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {ratingScore > 0 ? `${ratingScore}/5` : 'Not rated'}
                    </span>
                  </div>
                </div>
              )}

              {/* Reason Category (For negative feedback) */}
              {rating === false && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    What could be improved?
                  </label>
                  <select
                    value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a reason...</option>
                    {reasonCategories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Additional Details */}
              {rating === false && reasonCategory && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Additional details (optional)
                  </label>
                  <textarea
                    value={reasonDetails}
                    onChange={(e) => setReasonDetails(e.target.value)}
                    placeholder="Tell us more about what could be improved..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    style={{ color: 'inherit' }}
                  />
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!submitted && (
          <div className="flex justify-end gap-3 px-4 py-3 border-t bg-gray-50 dark:bg-gray-900">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || rating === null}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Submit Feedback</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
