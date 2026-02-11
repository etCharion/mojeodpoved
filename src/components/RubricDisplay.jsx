import React from 'react';
import { Star } from 'lucide-react';

export default function RubricDisplay({ rubric, ratings }) {
  if (!rubric || !ratings) return null;

  return (
    <div className="space-y-4">
      {rubric.map((item) => {
        const val = ratings[item.id];
        return (
          <div key={item.id} className="space-y-2">
            <p className="text-sm font-medium text-gray-700">{item.question}</p>
            {item.type === 'stars' ? (
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= val ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                  />
                ))}
                <span className="ml-2 text-sm font-bold text-gray-600">{val} / 5</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {item.options?.map((opt, idx) => {
                  const isSelected = val === (idx + 1);
                  return (
                    <div
                      key={idx}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                          : 'bg-white border-gray-100 text-gray-500'
                      }`}
                    >
                      {opt}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
