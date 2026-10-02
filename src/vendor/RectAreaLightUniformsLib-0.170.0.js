// Three.js r170, MIT. Copyright 2010-2024 Three.js Authors.
import { UniformsLib } from './three-0.170.0.module.min.js';
import { RectAreaLightTexturesLib } from './RectAreaLightTexturesLib-0.170.0.js';

class RectAreaLightUniformsLib {

	static init() {

		RectAreaLightTexturesLib.init();

		const { LTC_FLOAT_1, LTC_FLOAT_2, LTC_HALF_1, LTC_HALF_2 } = RectAreaLightTexturesLib;

		// data textures

		UniformsLib.LTC_FLOAT_1 = LTC_FLOAT_1;
		UniformsLib.LTC_FLOAT_2 = LTC_FLOAT_2;

		UniformsLib.LTC_HALF_1 = LTC_HALF_1;
		UniformsLib.LTC_HALF_2 = LTC_HALF_2;

	}

}

export { RectAreaLightUniformsLib };
