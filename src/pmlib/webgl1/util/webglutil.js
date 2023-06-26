
const width = 1024;
const height = 1024;
class webglUtil {
    static createTexture(gl, max_bones) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (max_bones === 2) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }else if (max_bones) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, max_bones, 0, gl.RGBA, gl.FLOAT, null);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }
    static createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }
        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }
    static createProgram(gl, vertexShader, fragmentShader,webgl2) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        if(webgl2){
            gl.transformFeedbackVaryings(program, ["out_pos"], gl.SEPARATE_ATTRIBS);
        }
        gl.linkProgram(program);
        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }
        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }
    static setAttribute(gl, program, data, attribute) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        const aTexcoordPositionLocation = gl.getAttribLocation(program, attribute);
        gl.enableVertexAttribArray(aTexcoordPositionLocation);
        gl.vertexAttribPointer(aTexcoordPositionLocation, 2, gl.FLOAT, false, 0, 0);
    }
}
export {
    webglUtil
}