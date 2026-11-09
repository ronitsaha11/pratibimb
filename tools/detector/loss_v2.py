"""
v2 detector loss with the partial-occlusion classification ignore mask (M22.13).

`targets.detector_loss` is unchanged and remains the reference. This module repeats its arithmetic
operation for operation - sigmoid focal classification (alpha 0.25, gamma 2) over every cell and
class, divided by the batch's positive-cell count, plus box_weight x (1 - IoU) over positive cells,
divided by the same count - and adds exactly one thing: classification entries the ignore mask marks
contribute zero (`torch.where`, so their gradient is zero too). With an all-false mask the result and
the gradients are bitwise those of `detector_loss`; a test holds that.

What the mask can never do, enforced here and refused if violated:
  - mask a positive target entry (positives take precedence; `occlusion_mask_v2` already never does);
  - touch the box term or its targets (the box term does not see the mask);
  - change the normaliser (the positive-cell count does not depend on the mask).

`loss_terms` returns the un-normalised sums so that a DEV pass can aggregate them over the whole
split (sum of numerators / sum of positive cells), the `dataset-sum` rule of the run configuration.
"""

import torch
import torch.nn.functional as F

from head import NUM_CLASSES
from targets import ciou_free_iou, decode_for_loss


class LossInputError(ValueError):
    """Inputs the v2 loss refuses: wrong shapes, non-finite values, or a mask over a positive."""


def _check(box_raw, cls_raw, pos_mask, box_t, cls_t, ignore):
    n = box_raw.shape[0]
    a = cls_raw.shape[2] * cls_raw.shape[3] if cls_raw.dim() == 4 else -1
    if box_raw.dim() != 4 or box_raw.shape[1] != 4 or cls_raw.dim() != 4 or cls_raw.shape[:2] != (n, NUM_CLASSES):
        raise LossInputError(f"model outputs must be [N,4,H,W] and [N,{NUM_CLASSES},H,W]")
    if tuple(pos_mask.shape) != (n, a) or tuple(box_t.shape) != (n, 4, a) or tuple(cls_t.shape) != (n, NUM_CLASSES, a):
        raise LossInputError(f"targets must be pos [N,A], box [N,4,A], cls [N,{NUM_CLASSES},A] with A = {a}")
    if not isinstance(ignore, torch.Tensor) or ignore.dtype != torch.bool or tuple(ignore.shape) != (n, NUM_CLASSES, a):
        raise LossInputError(f"the ignore mask must be a bool tensor [N,{NUM_CLASSES},A] = {[n, NUM_CLASSES, a]}")
    for name, t in (("box output", box_raw), ("class output", cls_raw), ("box targets", box_t), ("class targets", cls_t)):
        if not torch.isfinite(t).all():
            raise LossInputError(f"non-finite {name}: refused")
    if bool((ignore & (cls_t == 1)).any()):
        raise LossInputError("the ignore mask covers a positive target entry: positives take precedence, refused")


def loss_terms(box_raw, cls_raw, pos_mask, box_t, cls_t, ignore):
    """
    Un-normalised terms: (focal_sum, box_sum, num_pos, focal_per_entry, box_per_cell). The per-entry
    [N, C, A] masked focal tensor and the per-cell [N, A] box term are for accounting (per class, per
    size bucket). Same arithmetic as `detector_loss`.
    """
    _check(box_raw, cls_raw, pos_mask, box_t, cls_t, ignore)
    n = box_raw.shape[0]
    cls_logits = cls_raw.reshape(n, NUM_CLASSES, -1)  # [N,C,A]

    # ---- classification, all cells (as detector_loss), ignored entries contribute zero ----
    p = torch.sigmoid(cls_logits)
    ce = F.binary_cross_entropy_with_logits(cls_logits, cls_t, reduction="none")
    p_t = p * cls_t + (1 - p) * (1 - cls_t)
    alpha_t = 0.25 * cls_t + 0.75 * (1 - cls_t)
    focal = alpha_t * ((1 - p_t) ** 2.0) * ce
    focal = torch.where(ignore, torch.zeros_like(focal), focal)
    num_pos = pos_mask.sum()

    # ---- box, positives only (as detector_loss; the mask is not involved) ----
    pred = decode_for_loss(box_raw)
    iou = ciou_free_iou(pred, box_t)  # [N,A]
    box_cell = (1.0 - iou) * pos_mask.to(iou.dtype)
    return focal.sum(), box_cell.sum(), num_pos, focal, box_cell


def detector_loss_v2(box_raw, cls_raw, pos_mask, box_t, cls_t, ignore, box_weight=5.0):
    """`targets.detector_loss` with the ignore mask: (loss, cls_loss.detach(), box_loss.detach())."""
    focal_sum, box_sum, num_pos, _, _ = loss_terms(box_raw, cls_raw, pos_mask, box_t, cls_t, ignore)
    num_pos = num_pos.clamp(min=1).to(focal_sum.dtype)
    cls_loss = focal_sum / num_pos
    box_loss = box_sum / num_pos
    return cls_loss + box_weight * box_loss, cls_loss.detach(), box_loss.detach()
