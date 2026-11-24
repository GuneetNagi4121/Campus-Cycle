import { forwardRef } from 'react';
import { cn } from '../../utils/format';

const Card = forwardRef(function Card({ className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border border-slate-200 bg-white shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );
});

export default Card;
