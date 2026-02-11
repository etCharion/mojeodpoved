import React from 'react';
import { Star, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function RubricDisplay({ rubric, ratings }) {
  const { t } = useTranslation();
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
            ) : item.type === 'passfail' ? (
              <div className="flex items-center gap-2">
                {val ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <span className={`text-sm font-bold ${val ? 'text-green-600' : 'text-red-600'}`}>
                  {val ? t('common.pass') : t('common.fail')}
                </span>
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
