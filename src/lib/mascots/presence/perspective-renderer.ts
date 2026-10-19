import { createHeadMesh, headDepth, depthPose, DHONI_DEPTH } from './depth-rig.ts';
import { createFaceTexture } from './face-texture.ts';
import type { PresenceFrame } from './types.js';

const vertex = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform vec4 u_turn;
varying vec2 v_uv;
void main() {
 float x = a_position.x * u_turn.y + a_position.z * u_turn.x;
 float z = -a_position.x * u_turn.x + a_position.z * u_turn.y;
 float y = a_position.y * u_turn.w + z * u_turn.z;
 z = -a_position.y * u_turn.z + z * u_turn.w;
 float scale = 650.0 / (650.0 - z);
 vec2 screen = vec2(180.0,140.0) + vec2(x,y) * scale;
 gl_Position = vec4(screen.x/180.0-1.0,1.0-screen.y/180.0,-z/650.0,1.0);
 v_uv = a_uv;
}`;
const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_painting;
varying vec2 v_uv;
void main() {
 vec4 color = texture2D(u_painting,v_uv);
 if(color.a < 0.01) discard;
 gl_FragColor = color;
}`;

/** One draw call, static mesh buffers and cached texture uploads during stillness.
 * Real depth projection deforms nose/cheeks/ears differently. No rigid-image yaw. */
export async function createPerspectiveRenderer(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext('webgl', {
		alpha: true,
		antialias: true,
		premultipliedAlpha: true,
		depth: true
	});
	if (!gl) throw new Error('WebGL unavailable');
	const buffers: WebGLBuffer[] = [],
		shaders: WebGLShader[] = [];
	let program: WebGLProgram | null = null,
		texture: WebGLTexture | null = null,
		disposed = false;
	function dispose() {
		if (disposed) return;
		disposed = true;
		for (const buffer of buffers) gl!.deleteBuffer(buffer);
		for (const shader of shaders) gl!.deleteShader(shader);
		if (texture) gl!.deleteTexture(texture);
		if (program) gl!.deleteProgram(program);
	}
	try {
		const face = await createFaceTexture();
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error('Shader unavailable');
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
			return shader;
		};
		program = gl.createProgram();
		if (!program) throw new Error('Program unavailable');
		gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed');
		gl.useProgram(program);
		const mesh = createHeadMesh(),
			world = new Float32Array((mesh.source.length / 2) * 3);
		for (let i = 0, j = 0; i < mesh.source.length; i += 2, j += 3) {
			const x = mesh.source[i],
				y = mesh.source[i + 1],
				z = headDepth(x, y),
				f = DHONI_DEPTH.focal;
			world[j] = ((x - DHONI_DEPTH.center[0]) * (f - z)) / f;
			world[j + 1] = ((y - DHONI_DEPTH.center[1]) * (f - z)) / f;
			world[j + 2] = z;
		}
		for (const [name, data, width] of [
			['a_position', world, 3],
			['a_uv', mesh.uv, 2]
		] as const) {
			const buffer = gl.createBuffer();
			if (!buffer) throw new Error('Buffer unavailable');
			buffers.push(buffer);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
			const location = gl.getAttribLocation(program, name);
			gl.enableVertexAttribArray(location);
			gl.vertexAttribPointer(location, width, gl.FLOAT, false, 0, 0);
		}
		const index = gl.createBuffer();
		if (!index) throw new Error('Index buffer unavailable');
		buffers.push(index);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
		texture = gl.createTexture();
		if (!texture) throw new Error('Texture unavailable');
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.uniform1i(gl.getUniformLocation(program, 'u_painting'), 0);
		const turn = gl.getUniformLocation(program, 'u_turn');
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.clearColor(0, 0, 0, 0);
		let yaw = NaN,
			pitch = NaN,
			draws = 0,
			uploads = 0;
		return {
			dispose,
			get mouthReady() {
				return face.mouthReady;
			},
			draw(frame: PresenceFrame) {
				if (disposed || gl.isContextLost()) return;
				const changed = face.draw(frame),
					pose = depthPose(frame);
				if (!changed && pose.yaw === yaw && pose.pitch === pitch) return;
				if (changed) {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face.canvas);
					uploads++;
				}
				yaw = pose.yaw;
				pitch = pose.pitch;
				const a = (yaw * Math.PI) / 180,
					b = (pitch * Math.PI) / 180;
				gl.uniform4f(turn, Math.sin(a), Math.cos(a), Math.sin(b), Math.cos(b));
				gl.viewport(0, 0, canvas.width, canvas.height);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
				draws++;
				canvas.dataset.yaw = String(yaw);
				canvas.dataset.pitch = String(pitch);
				canvas.dataset.draws = String(draws);
				canvas.dataset.uploads = String(uploads);
				canvas.dataset.mouthReady = String(face.mouthReady);
			}
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
