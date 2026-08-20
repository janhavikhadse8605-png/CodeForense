import { motion } from 'framer-motion';
import { Check, Circle, Loader2 } from 'lucide-react';

const steps = [
  'Parsing source...',
  'Extracting AST...',
  'Analyzing naming...',
  'Analyzing structure...',
  'Analyzing complexity...',
  'Analyzing repetition...',
  'Analyzing comments...',
  'Analyzing formatting...',
  'Running CodeBERT...',
  'Generating evidence...',
  'Preparing report...',
];

interface AnalysisLoadingProps {
  currentStep?: number;
}

export default function AnalysisLoading({ currentStep = -1 }: AnalysisLoadingProps) {
  return (
    <motion.div
      className="card p-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="text-center mb-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          className="inline-block"
        >
          <Loader2 className="w-10 h-10 text-coral-500" />
        </motion.div>
        <h3 className="text-lg font-semibold text-slate-800 mt-3">Analyzing Code</h3>
        <p className="text-sm text-slate-500">Running trained model inference...</p>
      </div>

      <div className="space-y-2.5 max-w-sm mx-auto">
        {steps.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;
          const isPending = i > currentStep;

          return (
            <motion.div
              key={step}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isPending && currentStep >= 0 ? 0.4 : 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {isCompleted ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center"
                >
                  <Check className="w-3 h-3 text-green-600" />
                </motion.div>
              ) : isCurrent ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-5 h-5 rounded-full bg-coral-100 flex items-center justify-center"
                >
                  <Circle className="w-3 h-3 text-coral-500 fill-coral-500" />
                </motion.div>
              ) : (
                <Circle className="w-5 h-5 text-slate-300" />
              )}
              <span className={`text-sm ${isCurrent ? 'font-semibold text-coral-600' : isCompleted ? 'text-slate-600' : 'text-slate-400'}`}>
                {step}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
