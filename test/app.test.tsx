import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../src/app';

test('renders Hello World', () => {
  render(<App />);
  expect(screen.getByText('Hello World')).toBeInTheDocument();
});
