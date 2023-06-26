class Shader {
  static vertextSource = /*glsl*/ `#version 300 es
    in mediump vec3 pos;
    in mediump vec4 boneIds;
    in mediump vec4 weights;
    uniform sampler2D boneMatrixImage;
    out vec3 out_pos;

    mat4 getBoneMatrix(int boneNdx) {
        return mat4(
            texelFetch(boneMatrixImage, ivec2(0, boneNdx), 0),
            texelFetch(boneMatrixImage, ivec2(1, boneNdx), 0),
            texelFetch(boneMatrixImage, ivec2(2, boneNdx), 0),
            texelFetch(boneMatrixImage, ivec2(3, boneNdx), 0));
    }

    void main(void) {
        vec4 totalPosition = vec4(0.0);
        for(int i=0; i<4; i++)
        {
            int boneId = int(boneIds[i]);
            vec4 localPosition = getBoneMatrix(boneId) * vec4(pos,1.0);
            totalPosition += localPosition*weights[i];
        }
        out_pos = totalPosition.xyz;
    }
    `;
  static fragmentSource = /*glsl*/ `#version 300 es
    precision mediump float;
    void main() {
    }
    `;
}
export { Shader };
