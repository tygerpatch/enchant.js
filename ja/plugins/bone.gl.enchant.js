/**
 * bone.gl.enchant.js
 * @version 0.2.1
 * @require enchant.js v0.4.5+
 * @require gl.enchant.js v0.3.5+
 * @author Ubiquitous Entertainment Inc.
 *
 * @description
 * スキニングアニメーションをするためのクラス群.
 * 現在, mmd.gl.enchant.jsのみが使用している.
 *
 * @detail
 * 三次スプライン補間のための関数をMMD.jsより引用しています.
 *
 * MMD.js:
 * https://github.com/edvakf/MMD.js
 * MMD.jsについて:
 * http://edv.sakura.ne.jp/mmd/
 */

(function() {

    // borrowed from MMD.js
    var bezierp = function(x1, x2, y1, y2, x) {
        var t, tt, v;
        t = x;
        while (true) {
            v = ipfunc(t, x1, x2) - x;
            if (v * v < 0.0000001) {
                break;
            }
            tt = ipfuncd(t, x1, x2);
            if (tt === 0) {
                break;
            }
            t -= v / tt;
        }
        return ipfunc(t, y1, y2);
    };
    var ipfunc = function(t, p1, p2) {
        return (1 + 3 * p1 - 3 * p2) * t * t * t + (3 * p2 - 6 * p1) * t * t + 3 * p1 * t;
    };
    var ipfuncd = function(t, p1, p2) {
        return (3 + 9 * p1 - 9 * p2) * t * t + (6 * p2 - 12 * p1) * t + 3 * p1;
    };
    var frac = function(n1, n2, t) {
        return (t - n1) / (n2 - n1);
    };
    var lerp = function(n1, n2, r) {
        return n1 + r * (n2 - n1);
    };

    /**
     * @scope enchant.gl.State.prototype
     */
    enchant.gl.State = enchant.Class.create({
        /**
         * アニメーションの状態を表すための基底クラス.
         * @param {Number[]} position
         * @param {Number[]} rotation
         * @constructs
         */
        initialize: function(position, rotation) {
            this._position = vec3.create();
            vec3.set(position, this._position);
            this._rotation = quat4.create();
            quat4.set(rotation, this._rotation);
        },
        /**
         * 位置・回転をセットする.
         */
        set: function(pose) {
            vec3.set(pose._position, this._position);
            quat4.set(pose._rotation, this._rotation);
        }
    });

    /**
     * @scope enchant.gl.Pose.prototype
     */
    enchant.gl.Pose = enchant.Class.create(enchant.gl.State, {
        /**
         * 姿勢を処理するためのクラス.
         * @param {Number[]} position
         * @param {Number[]} rotation
         * @constructs
         * @extends enchant.gl.State
         */
        initialize: function(position, rotation) {
            enchant.gl.State.call(this, position, rotation);
        },
        /**
         * 他の姿勢との補間を行う.
         * @param {enchant.gl.Pose} another
         * @param {Number} ratio
         * @return {enchant.gl.Pose}
         */
        getInterpolation: function(another, ratio) {
            var v = vec3.create();
            var q = quat4.create();
            var loc = vec3.lerp(this._position, another._position, ratio, v);
            var rot = quat4.slerp(this._rotation, another._rotation, ratio, q);
            return new enchant.gl.Pose(loc, rot);
        },
        _bezierp: function(x1, y1, x2, y2, x) {
            return bezierp(x1, x2, y1, y2, x);
        }
    });

    /**
     * @scope enchant.gl.KeyFrameManager.prototype
     */
    enchant.gl.KeyFrameManager = enchant.Class.create({
        /**
         * キーフレームアニメーションを実現するためのクラス.
         * enchant.gl.Poseに限らず様々なデータを扱える.
         * @constructs
         */
        initialize: function() {
            this._frames = [];
            this._units = [];
            this.length = -1;
            this._lastPose = null;
        },
        /**
         * フレームを追加する.
         * @param {*} pose キーフレーム.
         * @param {Number} frame フレーム番号.
         */
        addFrame: function(pose, frame) {
            if (typeof frame !== 'number') {
                this.length += 1;
                frame = this.length;
            }
            if (frame > this.length) {
                this.length = frame;
                this._lastPose = pose;
            }
            this._frames.push(frame);
            this._units[frame] = pose;
        },
        /**
         * 指定されたフレーム番号の情報を返す.
         * 指定されたフレーム番号に該当するデータがない場合, 指定されたフレーム番号の前後のデータから補間したデータを取得する.
         * @param {Number} frame フレーム番号
         * @return {*}
         */
        getFrame: function(frame) {
            var prev, next, index, pidx, nidx;
            var ratio = 0;
            if (frame >= this.length) {
                prev = next = this._lastPose;
            } else {
                index = this._getPrevFrameIndex(frame);
                pidx = this._frames[index];
                nidx = this._frames[index + 1];
                prev = this._units[pidx];
                next = this._units[nidx];
                ratio = this._frac(pidx, nidx, frame);
            }
            return this._interpole(prev, next, ratio);
        },
        _frac: function(p, n, t) {
            return frac(p, n, t);
        },
        _interpole: function(prev, next, ratio) {
            return prev.getInterpolation(next, ratio);
        },
        _sort: function() {
            this._frames.sort(function(a, b) {
                return a - b;
            });
        },
        _getPrevFrameIndex: function(frame) {
            for (var i = 0, l = this._frames.length; i < l; i++) {
                if (this._frames[i] > frame) {
                    break;
                }
            }
            return i - 1;
        }
    });

    /**
     * @scope enchant.gl.Bone.prototype
     */
    enchant.gl.Bone = enchant.Class.create(enchant.gl.State, {
        /**
         * ボーンの状態を表すクラス.
         * @param {String} name
         * @param {Number} head
         * @param {Number} position
         * @param {Number} rotation
         * @constructs
         * @extends enchant.gl.State
         */
        initialize: function(name, head, position, rotation) {
            enchant.gl.State.call(this, position, rotation);
            this._name = name;
            this._origin = vec3.create();

            vec3.set(head, this._origin);

            this._globalpos = vec3.create();
            vec3.set(head, this._globalpos);

            this._globalrot = quat4.create([0, 0, 0, 1]);

            this.parentNode = null;
            this.childNodes = [];

            /**
             * IK解決の際にクォータニオンに変換をかける関数を設定する.
             */
            this.constraint = null;
        },
        /**
         * ボーンに子のボーンを追加する.
         * @param {enchant.gl.Bone} child
         */
        addChild: function(child) {
            this.childNodes.push(child);
            child.parentNode = this;
        },
        /**
         * ボーンから子のボーンを削除する.
         * @param {enchant.gl.Bone} child
         */
        removeChild: function(child) {
            var i;
            if ((i = this.childNodes.indexOf(child)) !== -1) {
                this.childNodes.splice(i, 1);
            }
            child.parentNode = null;
        },
        /**
         * ボーンの姿勢をセットする.
         * @param {*} poses
         */
        setPoses: function(poses) {
            var child;
            if (poses[this._name]) {
                this.set(poses[this._name]);
            }
            for (var i = 0, l = this.childNodes.length; i < l; i++) {
                child = this.childNodes[i];
                child.setPoses(poses);
            }
        },
        _applyPose: function(){
            var parent = this.parentNode;
            quat4.multiply(parent._globalrot, this._rotation, this._globalrot);
            quat4.multiplyVec3(parent._globalrot, this._position, this._globalpos);
            vec3.add(parent._globalpos, this._globalpos, this._globalpos);
        },
        _solveFK: function() {
            var child;
            this._applyPose();
            for (var i = 0, l = this.childNodes.length; i < l; i++) {
                child = this.childNodes[i];
                child._solveFK();
            }
        },
        _solve: function(quat) {
            quat4.normalize(quat, this._rotation);
            this._solveFK();
        }
    });

    var _tmp = {
        ve: vec3.create(),
        vt: vec3.create(),
        axis: vec3.create(),
        quat: quat4.create(),
        inv: quat4.create()
    };

    /**
     * @scope enchant.gl.Skeleton.prototype
     */
    enchant.gl.Skeleton = enchant.Class.create({
        /**
         * ボーンの構造のルートになるクラス.
         * @constructs
         */
        initialize: function() {
            this.childNodes = [];
            this._origin = vec3.create();
            this._position = vec3.create();
            this._rotation = quat4.create([0, 0, 0, 1]);
            this._globalpos = vec3.create();
            this._globalrot = quat4.create([0, 0, 0, 1]);
            this._iks = [];
        },
        /**
         * Skeletonに子のボーンを追加する.
         * @param {enchant.gl.Bone} child
         */
        addChild: function(bone) {
            this.childNodes.push(bone);
            bone.parentNode = this;
        },
        /**
         * Skeletonから子のボーンを削除する.
         * @param {enchant.gl.Bone} child
         */
        removeChild: function(bone) {
            var i;
            if ((i = this.childNodes.indexOf(bone)) !== -1) {
                this.childNodes.splice(i, 1);
            }
            bone.parentNode = null;
        },
        /**
         * 姿勢をセットする.
         * @param {*} poses
         */
        setPoses: function(poses) {
            var child;
            for (var i = 0, l = this.childNodes.length; i < l; i++) {
                child = this.childNodes[i];
                child.setPoses(poses);
            }
        },
        /**
         * FKによって姿勢解決を行う.
         * セットされた姿勢情報から姿勢をつくる.
         */
        solveFKs: function() {
            var child;
            for (var i = 0, l = this.childNodes.length; i < l; i++) {
                child = this.childNodes[i];
                child._solveFK();
            }
        },
        /**
         * IKの制御情報を追加する.
         * @param {enchant.gl.Bone} effector
         * @param {enchant.gl.Bone} target
         * @param {enchant.gl.Bone[]} bones
         * @param {Number} maxangle
         * @param {Number} iteration
         * @see enchant.gl.Skeleton#solveIKs
         */
        addIKControl: function(effector, target, bones, maxangle, iteration) {
            this._iks.push(arguments);
        },
        // by ccd
        /**
         * IKによって姿勢解決を行う.
         * {@link enchant.gl.Skeleton#addIKControl}によって追加された情報をもとにする.
         */
        solveIKs: function() {
            var param;
            for (var i = 0, l = this._iks.length; i < l; i++) {
                param = this._iks[i];
                this._solveIK.apply(this, param);
            }
        },
        _solveIK: function(effector, target, bones, maxangle, iteration) {
            var len, origin;
            var tmp = _tmp.inv;
            vec3.subtract(target._origin, target.parentNode._origin, tmp);
            var threshold = vec3.length(tmp) * 0.1;
            for (var i = 0; i < iteration; i++) {
                vec3.subtract(target._globalpos, effector._globalpos, tmp);
                len = vec3.length(tmp);
                if (len < threshold) {
                    break;
                }
                for (var j = 0, ll = bones.length; j < ll; j++) {
                    origin = bones[j];
                    this._ccd(effector, target, origin, maxangle, threshold);
                }
            }
        },
        _ccd: function(effector, target, origin, maxangle, threshold) {
            var ve = _tmp.ve;
            var vt = _tmp.vt;
            var axis = _tmp.axis;
            var quat = _tmp.quat;
            var inv = _tmp.inv;
            vec3.subtract(effector._globalpos, origin._globalpos, ve);
            vec3.subtract(target._globalpos, origin._globalpos, vt);
            vec3.cross(vt, ve, axis);
            var elen = vec3.length(ve);
            var tlen = vec3.length(vt);
            var alen = vec3.length(axis);
            var parent = origin.parentNode;
            if (elen < threshold || tlen < threshold || alen < threshold) {
                return;
            }
            var rad = Math.acos(vec3.dot(ve, vt) / elen / tlen);
            if (rad > maxangle) {
                rad = maxangle;
            }
            vec3.scale(axis, Math.sin(rad / 2) / alen, quat);
            quat[3] = Math.cos(rad / 2);
            quat4.inverse(parent._globalrot, inv);
            quat4.multiply(inv, quat, quat);
            quat4.multiply(quat, origin._globalrot, quat);

            if (origin.constraint) {
                origin.constraint(quat);
            }

            origin._solve(quat);
        }
    });

}());
