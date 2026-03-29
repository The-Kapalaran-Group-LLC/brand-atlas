import '@testing-library/jest-dom';

// jsdom does not implement canvas contexts by default.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
	value: () => {
		return {
			setTransform: () => {},
			clearRect: () => {},
			save: () => {},
			restore: () => {},
			translate: () => {},
			scale: () => {},
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			closePath: () => {},
			fill: () => {},
			stroke: () => {},
			arc: () => {},
			ellipse: () => {},
			fillRect: () => {},
			createLinearGradient: () => ({ addColorStop: () => {} }),
			createRadialGradient: () => ({ addColorStop: () => {} }),
			setLineDash: () => {},
			lineDashOffset: 0,
			lineWidth: 1,
			lineCap: 'round',
			fillStyle: '#000',
			strokeStyle: '#000',
		} as unknown as CanvasRenderingContext2D;
	},
});
