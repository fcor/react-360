/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

import IndexBuffer from './IndexBuffer';
import {type Attribute} from './Program';
import VertexBuffer from './VertexBuffer';
import getAttributeSizeAndType from './getAttributeSizeAndType';

/**
 * Return the byte length of a GL type
 */
function sizeof(gl: WebGLRenderingContext, type: number) {
  switch (type) {
    case gl.BYTE:
    case gl.UNSIGNED_BYTE:
      return 1;
    case gl.SHORT:
    case gl.UNSIGNED_SHORT:
      return 2;
    case gl.FLOAT:
      return 4;
  }
  throw new Error('Unrecognized vertex type');
}

type AttributeInfo = {
  loc: number,
  normalize: boolean,
  offset: number,
  size: number,
  type: number,
};

/**
 * Buffered geometry primitive, designed to support interleaved and indexed
 * vertex arrays.
 */
export default class Geometry {
  _attributes: Array<AttributeInfo>;
  _buffer: VertexBuffer;
  _data: ?Float32Array;
  _dataLength: number;
  _gl: WebGLRenderingContext;
  _indexBuffer: ?IndexBuffer;
  _indexArray: ?Uint16Array;
  _indexCount: number;
  _stride: number;

  constructor(gl: WebGLRenderingContext) {
    this._attributes = [];
    this._buffer = new VertexBuffer(gl);
    this._data = null;
    this._dataLength = 0;
    this._indexBuffer = null;
    this._indexArray = null;
    this._indexCount = 0;
    this._gl = gl;
    this._stride = 0;
  }

  /**
   * Specify that an attribute should be made available on the interleaved
   * buffer. ORDER MATTERS HERE – the order you call addAttribute in will be the
   * expected order of elements on the array.
   * A normalized array will assume elements are unsigned bytes, not floats. We
   * do not use any other normalized data types. This can change in the future.
   * The Geometry looks at the type and size of the attribute, and uses that
   * to automatically calculate the stride and offset for each attribute,
   * so that you don't need to compute that when binding to the attribute.
   */
  addAttribute(attr: Attribute, normalize: boolean = false) {
    const gl = this._gl;
    const {size, type} = getAttributeSizeAndType(gl, attr, normalize);
    const length = sizeof(gl, type);
    this._attributes.push({
      loc: attr.location,
      size,
      type,
      normalize,
      offset: this._stride,
    });
    this._stride += length * size;
  }

  /**
   * Copy data to the buffer source for the Geometry's attributes.
   * If an Array of numbers is passed, it will be assumed that every element
   * is a Float32. If you have attribute data that interleaves non-float types,
   * you should construct an ArrayBuffer directly and pass it to bufferData.
   */
  bufferData(data: ArrayBuffer | Array<number>) {
    if (data instanceof ArrayBuffer) {
      this._buffer.bufferData(data);
      this._dataLength = data.byteLength;
      return;
    }
    if (this._data && data.length <= this._data.length) {
      for (let i = 0; i < data.length; i++) {
        this._data[i] = data[i];
      }
      for (let i = data.length; i < this._data.length; i++) {
        this._data[i] = 0;
      }
    } else {
      this._data = new Float32Array(data);
    }
    this._dataLength = data.length * 4;
    this._buffer.bufferData(this._data.buffer);
  }

  /**
   * Copy an array of numbers to the element array buffer, for geometries that
   * use vertex indexing.
   * It is assumed that every element in the array is a Uint16.
   */
  bufferIndex(index: Array<number>) {
    if (this._indexArray && index.length < this._indexArray.length) {
      for (let i = 0; i < index.length; i++) {
        this._indexArray[i] = index[i];
      }
      for (let i = index.length; i < this._indexArray.length; i++) {
        this._indexArray[i] = 0;
      }
    } else {
      this._indexArray = new Uint16Array(index);
    }
    this._indexCount = index.length;
    if (!this._indexBuffer) {
      this._indexBuffer = new IndexBuffer(this._gl);
    }
    this._indexBuffer.bufferData(this._indexArray);
  }

  /**
   * Bind all attributes to the current array buffer.
   */
  bindToAttributes() {
    for (let i = 0; i < this._attributes.length; i++) {
      const attr = this._attributes[i];
      this._buffer.bindToAttribute(
        attr.loc,
        attr.size,
        attr.type,
        !!attr.normalize,
        this._stride,
        attr.offset
      );
    }
    if (this._indexBuffer) {
      this._indexBuffer.bindToElements();
    }
  }

  /**
   * Draw arrays (or elements, in the case of indexed geometries), to the
   * current GL context. We only support drawing triangles.
   */
  draw() {
    if (this._dataLength % this._stride !== 0) {
      console.warn(
        'Geometry buffer length is not perfectly divisible by stride. This can cause unintended errors'
      );
    }
    const gl = this._gl;
    if (this._indexArray) {
      gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_SHORT, 0);
    } else {
      const count = this._dataLength / this._stride;
      gl.drawArrays(gl.TRIANGLES, 0, count);
    }
  }
}
